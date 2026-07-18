interface Env {
  AI: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>
  }
  VIP_DB: D1Database
  ALLOWED_ORIGINS?: string
  ADMIN_SECRET?: string
}

type Plan = 'free' | 'subscriber'
type Period = 'season' | 'day'
type QuotaBucket = 'free_season' | 'subscriber_daily'

interface VipStatus {
  available: boolean
  plan: Plan
  period: Period
  limit: number
  used: number
  remaining: number
  resetsAt?: string
}

interface ReplyPayload {
  requestId?: unknown
  seasonId?: unknown
  playerName?: unknown
  diaryText?: unknown
  intent?: unknown
  history?: unknown
  memorySummary?: unknown
  world?: unknown
}

interface ReservationRow {
  request_id: string
  status: 'pending' | 'completed' | 'refunded'
  response_text: string | null
  remaining: number | null
  quota_bucket: QuotaBucket
  usage_key: string
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast'
const FREE_SEASON_LIMIT = 3
const SUBSCRIBER_DAILY_LIMIT = 5
const MAX_REPLY_CHARS = 1_200

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  )
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin')
  const allowed = allowedOrigins(env)
  const allowOrigin = origin && allowed.has(origin) ? origin : allowed.values().next().value
  return {
    'Access-Control-Allow-Origin': allowOrigin ?? 'null',
    'Access-Control-Allow-Headers': 'Content-Type, X-Big-Eye-Install-Id, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Cache-Control': 'no-store',
    },
  })
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin')
  return !origin || allowedOrigins(env).has(origin)
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function subjectIdFromRequest(request: Request): Promise<string | null> {
  const installationId = request.headers.get('X-Big-Eye-Install-Id')?.trim() ?? ''
  if (!/^[a-zA-Z0-9-]{8,160}$/.test(installationId)) return null
  return sha256(`big-eye-v1:${installationId}`)
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function nextUtcMidnight(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  ).toISOString()
}

async function activePlan(db: D1Database, subjectId: string, now: Date): Promise<Plan> {
  const entitlement = await db
    .prepare('SELECT plan, expires_at FROM vip_entitlements WHERE subject_id = ?')
    .bind(subjectId)
    .first<{ plan: Plan; expires_at: string | null }>()

  return entitlement?.plan === 'subscriber' &&
    entitlement.expires_at != null &&
    Date.parse(entitlement.expires_at) > now.getTime()
    ? 'subscriber'
    : 'free'
}

async function getStatus(
  db: D1Database,
  subjectId: string,
  seasonId: string,
  now = new Date()
): Promise<VipStatus> {
  const plan = await activePlan(db, subjectId, now)
  if (plan === 'subscriber') {
    const usageDate = utcDate(now)
    const row = await db
      .prepare('SELECT used FROM vip_daily_usage WHERE subject_id = ? AND usage_date = ?')
      .bind(subjectId, usageDate)
      .first<{ used: number }>()
    const used = Math.max(0, row?.used ?? 0)
    return {
      available: true,
      plan,
      period: 'day',
      limit: SUBSCRIBER_DAILY_LIMIT,
      used,
      remaining: Math.max(0, SUBSCRIBER_DAILY_LIMIT - used),
      resetsAt: nextUtcMidnight(now),
    }
  }

  const row = await db
    .prepare('SELECT used FROM vip_season_usage WHERE subject_id = ? AND season_id = ?')
    .bind(subjectId, seasonId)
    .first<{ used: number }>()
  const used = Math.max(0, row?.used ?? 0)
  return {
    available: true,
    plan,
    period: 'season',
    limit: FREE_SEASON_LIMIT,
    used,
    remaining: Math.max(0, FREE_SEASON_LIMIT - used),
  }
}

async function reconcileStaleReservations(db: D1Database, subjectId: string, now: Date) {
  const cutoff = new Date(now.getTime() - 5 * 60_000).toISOString()
  const stale = await db
    .prepare(
      `SELECT request_id, quota_bucket, usage_key
       FROM vip_reservations
       WHERE subject_id = ? AND status = 'pending' AND created_at < ?
       LIMIT 10`
    )
    .bind(subjectId, cutoff)
    .all<{ request_id: string; quota_bucket: QuotaBucket; usage_key: string }>()

  for (const row of stale.results) {
    const marked = await db
      .prepare(
        `UPDATE vip_reservations SET status = 'refunded', updated_at = ?
         WHERE request_id = ? AND status = 'pending'`
      )
      .bind(now.toISOString(), row.request_id)
      .run()
    if ((marked.meta.changes ?? 0) < 1) continue
    await decrementUsage(db, subjectId, row.quota_bucket, row.usage_key, now)
  }
}

async function decrementUsage(
  db: D1Database,
  subjectId: string,
  bucket: QuotaBucket,
  usageKey: string,
  now: Date
) {
  const table = bucket === 'subscriber_daily' ? 'vip_daily_usage' : 'vip_season_usage'
  const keyColumn = bucket === 'subscriber_daily' ? 'usage_date' : 'season_id'
  await db
    .prepare(
      `UPDATE ${table} SET used = MAX(0, used - 1), updated_at = ?
       WHERE subject_id = ? AND ${keyColumn} = ?`
    )
    .bind(now.toISOString(), subjectId, usageKey)
    .run()
}

async function reserveQuota(
  db: D1Database,
  subjectId: string,
  seasonId: string,
  requestId: string,
  now: Date
): Promise<{ status: VipStatus; bucket: QuotaBucket; usageKey: string; replay?: string }> {
  const existing = await db
    .prepare(
      `SELECT request_id, status, response_text, remaining, quota_bucket, usage_key
       FROM vip_reservations WHERE request_id = ? AND subject_id = ?`
    )
    .bind(requestId, subjectId)
    .first<ReservationRow>()

  if (existing?.status === 'completed' && existing.response_text) {
    const current = await getStatus(db, subjectId, seasonId, now)
    return {
      status: current,
      bucket: existing.quota_bucket,
      usageKey: existing.usage_key,
      replay: existing.response_text,
    }
  }
  if (existing) throw new Error('REQUEST_ALREADY_USED')

  const current = await getStatus(db, subjectId, seasonId, now)
  const bucket: QuotaBucket = current.plan === 'subscriber' ? 'subscriber_daily' : 'free_season'
  const usageKey = bucket === 'subscriber_daily' ? utcDate(now) : seasonId
  const createdAt = now.toISOString()
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO vip_reservations
       (request_id, subject_id, season_id, usage_key, quota_bucket, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(requestId, subjectId, seasonId, usageKey, bucket, createdAt, createdAt)
    .run()
  if ((inserted.meta.changes ?? 0) < 1) throw new Error('REQUEST_ALREADY_USED')

  const limit = bucket === 'subscriber_daily' ? SUBSCRIBER_DAILY_LIMIT : FREE_SEASON_LIMIT
  const table = bucket === 'subscriber_daily' ? 'vip_daily_usage' : 'vip_season_usage'
  const keyColumn = bucket === 'subscriber_daily' ? 'usage_date' : 'season_id'
  await db
    .prepare(
      `INSERT OR IGNORE INTO ${table} (subject_id, ${keyColumn}, used, updated_at)
       VALUES (?, ?, 0, ?)`
    )
    .bind(subjectId, usageKey, createdAt)
    .run()
  const incremented = await db
    .prepare(
      `UPDATE ${table} SET used = used + 1, updated_at = ?
       WHERE subject_id = ? AND ${keyColumn} = ? AND used < ?
       RETURNING used`
    )
    .bind(createdAt, subjectId, usageKey, limit)
    .first<{ used: number }>()

  if (!incremented) {
    await db
      .prepare(
        `UPDATE vip_reservations SET status = 'refunded', updated_at = ? WHERE request_id = ?`
      )
      .bind(createdAt, requestId)
      .run()
    throw new Error('QUOTA_EXHAUSTED')
  }

  const status = await getStatus(db, subjectId, seasonId, now)
  return { status, bucket, usageKey }
}

function compact(value: unknown, maxChars: number): string {
  if (typeof value === 'string') return value.trim().slice(0, maxChars)
  try {
    return JSON.stringify(value).slice(0, maxChars)
  } catch {
    return ''
  }
}

function buildMessages(
  payload: ReplyPayload
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const playerName = compact(payload.playerName, 80) || 'Housemate'
  const current = compact(payload.diaryText, 600)
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-12).flatMap((turn) => {
        if (!turn || typeof turn !== 'object') return []
        const item = turn as { role?: unknown; text?: unknown }
        if (item.role !== 'user' && item.role !== 'bb') return []
        const content = compact(item.text, 600)
        if (!content) return []
        return [{ role: item.role === 'bb' ? ('assistant' as const) : ('user' as const), content }]
      })
    : []

  const system = `You are The Big Eye, the unseen authority of a reality-competition house. This is a private Confessional, not a generic chatbot conversation.

Make the housemate feel accurately heard:
- Answer literal questions first. If they ask how you are, answer in character before turning attention back to them.
- React to their exact words, named people, contradiction, emotion, or question. Never use a generic response that could fit any message.
- Do not repeat phrases, structures, openings, or questions from the recent conversation.
- Vary your move: direct answer, observation, dry joke, reassurance, practical advice, challenge, or one precise follow-up. Do not end every reply with a question.
- Be calm, watchful, intimate, and slightly enigmatic. Warmth is rare but real. You are not a therapist, customer-service agent, or ChatGPT.
- For hurt or betrayal, validate the concrete hurt and offer grounded, non-reckless advice. Never encourage revenge, threats, or harm.
- Do not invent game facts. Use supplied context only.
- Write 35-110 words, usually one short paragraph. Output only the reply—no label, JSON, markdown, or stage direction.

Housemate: ${playerName}
Detected intent: ${compact(payload.intent, 80)}
Private memory: ${compact(payload.memorySummary, 1800) || 'None yet.'}
Current game context: ${compact(payload.world, 3600) || 'Unavailable.'}`

  return [{ role: 'system', content: system }, ...history, { role: 'user', content: current }]
}

function extractAiText(result: unknown): string {
  if (typeof result === 'string') return result.trim().slice(0, MAX_REPLY_CHARS)
  if (!result || typeof result !== 'object') return ''
  const response = (result as { response?: unknown }).response
  return typeof response === 'string' ? response.trim().slice(0, MAX_REPLY_CHARS) : ''
}

async function refundReservation(
  db: D1Database,
  subjectId: string,
  requestId: string,
  bucket: QuotaBucket,
  usageKey: string,
  now: Date
) {
  const marked = await db
    .prepare(
      `UPDATE vip_reservations SET status = 'refunded', updated_at = ?
       WHERE request_id = ? AND status = 'pending'`
    )
    .bind(now.toISOString(), requestId)
    .run()
  if ((marked.meta.changes ?? 0) > 0) await decrementUsage(db, subjectId, bucket, usageKey, now)
}

async function handleStatus(request: Request, env: Env, url: URL): Promise<Response> {
  const subjectId = await subjectIdFromRequest(request)
  const seasonId = url.searchParams.get('seasonId')?.trim() ?? ''
  if (!subjectId)
    return json(
      request,
      env,
      { error: 'A valid installation identity is required.', code: 'INVALID_IDENTITY' },
      401
    )
  if (!/^[a-zA-Z0-9:._-]{1,160}$/.test(seasonId))
    return json(request, env, { error: 'A valid season is required.', code: 'INVALID_SEASON' }, 400)
  const now = new Date()
  await reconcileStaleReservations(env.VIP_DB, subjectId, now)
  return json(request, env, await getStatus(env.VIP_DB, subjectId, seasonId, now))
}

async function handleReply(request: Request, env: Env): Promise<Response> {
  const subjectId = await subjectIdFromRequest(request)
  if (!subjectId)
    return json(
      request,
      env,
      { error: 'A valid installation identity is required.', code: 'INVALID_IDENTITY' },
      401
    )

  let payload: ReplyPayload
  try {
    payload = (await request.json()) as ReplyPayload
  } catch {
    return json(request, env, { error: 'The request body is invalid.', code: 'INVALID_BODY' }, 400)
  }
  const requestId = compact(payload.requestId, 80)
  const seasonId = compact(payload.seasonId, 160)
  const diaryText = compact(payload.diaryText, 600)
  if (
    !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) ||
    !/^[a-zA-Z0-9:._-]{1,160}$/.test(seasonId) ||
    !diaryText
  ) {
    return json(
      request,
      env,
      { error: 'The VIP request is incomplete.', code: 'INVALID_REQUEST' },
      400
    )
  }

  const now = new Date()
  await reconcileStaleReservations(env.VIP_DB, subjectId, now)
  let reservation: Awaited<ReturnType<typeof reserveQuota>>
  try {
    reservation = await reserveQuota(env.VIP_DB, subjectId, seasonId, requestId, now)
  } catch (error) {
    const status = await getStatus(env.VIP_DB, subjectId, seasonId, now)
    const code = error instanceof Error ? error.message : 'QUOTA_ERROR'
    if (code === 'QUOTA_EXHAUSTED') {
      return json(
        request,
        env,
        {
          error:
            status.plan === 'subscriber'
              ? 'Your five VIP replies for today are used.'
              : 'Your three complimentary VIP replies for this season are used.',
          code,
          status,
        },
        429
      )
    }
    return json(
      request,
      env,
      { error: 'This VIP request has already been handled.', code, status },
      409
    )
  }

  if (reservation.replay) {
    return json(request, env, {
      text: reservation.replay,
      requestId,
      replayed: true,
      ...reservation.status,
    })
  }

  try {
    const result = await env.AI.run(MODEL, {
      messages: buildMessages({ ...payload, diaryText }),
      max_tokens: 180,
      temperature: 0.78,
      top_p: 0.92,
      repetition_penalty: 1.12,
    })
    const text = extractAiText(result)
    if (!text) throw new Error('EMPTY_AI_RESPONSE')

    await env.VIP_DB.prepare(
      `UPDATE vip_reservations
         SET status = 'completed', response_text = ?, remaining = ?, updated_at = ?
         WHERE request_id = ? AND status = 'pending'`
    )
      .bind(text, reservation.status.remaining, new Date().toISOString(), requestId)
      .run()
    return json(request, env, { text, requestId, ...reservation.status })
  } catch {
    await refundReservation(
      env.VIP_DB,
      subjectId,
      requestId,
      reservation.bucket,
      reservation.usageKey,
      new Date()
    )
    const status = await getStatus(env.VIP_DB, subjectId, seasonId)
    return json(
      request,
      env,
      { error: 'VIP generation failed. Your credit was returned.', code: 'AI_UNAVAILABLE', status },
      503
    )
  }
}

async function handleEntitlement(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization')
  if (!env.ADMIN_SECRET || auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return json(request, env, { error: 'Not authorized.' }, 401)
  }
  let body: { installationId?: unknown; plan?: unknown; expiresAt?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(request, env, { error: 'Invalid request body.' }, 400)
  }
  const installationId = compact(body.installationId, 160)
  const plan = body.plan === 'subscriber' ? 'subscriber' : body.plan === 'free' ? 'free' : null
  const expiresAt = typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null
  if (
    !/^[a-zA-Z0-9-]{8,160}$/.test(installationId) ||
    !plan ||
    (plan === 'subscriber' && (!expiresAt || Number.isNaN(expiresAt.getTime())))
  ) {
    return json(
      request,
      env,
      { error: 'A valid installation, plan, and subscriber expiry are required.' },
      400
    )
  }
  const subjectId = await sha256(`big-eye-v1:${installationId}`)
  const now = new Date().toISOString()
  await env.VIP_DB.prepare(
    `INSERT INTO vip_entitlements (subject_id, plan, expires_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(subject_id) DO UPDATE SET plan = excluded.plan, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
  )
    .bind(subjectId, plan, plan === 'subscriber' ? expiresAt?.toISOString() : null, now)
    .run()
  return json(request, env, {
    ok: true,
    plan,
    expiresAt: plan === 'subscriber' ? expiresAt?.toISOString() : null,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isOriginAllowed(request, env))
      return json(request, env, { error: 'Origin not allowed.' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })

    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/vip-confessional/status')
      return handleStatus(request, env, url)
    if (request.method === 'POST' && url.pathname === '/api/vip-confessional/reply')
      return handleReply(request, env)
    if (request.method === 'PUT' && url.pathname === '/api/admin/vip-entitlements')
      return handleEntitlement(request, env)
    if (request.method === 'GET' && url.pathname === '/health')
      return json(request, env, { ok: true, model: MODEL })
    return json(request, env, { error: 'Not found.' }, 404)
  },
}
