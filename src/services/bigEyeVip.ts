import type { BigEyeHistoryTurn, BigEyeWorldContext } from './bigBrother'

const INSTALLATION_ID_KEY = 'bbmobilenew:vip-installation-id:v1'
const VIP_TIMEOUT_MS = 24_000

export type BigEyeVipPlan = 'free' | 'subscriber'
export type BigEyeVipPeriod = 'season' | 'day'

export interface BigEyeVipStatus {
  available: boolean
  plan: BigEyeVipPlan
  period: BigEyeVipPeriod
  limit: number
  used: number
  remaining: number
  resetsAt?: string
}

export interface BigEyeVipReplyRequest {
  seasonId: string
  playerName: string
  diaryText: string
  intent: string
  history: BigEyeHistoryTurn[]
  memorySummary: string
  world: BigEyeWorldContext
}

export interface BigEyeVipReply extends BigEyeVipStatus {
  text: string
  requestId: string
  replayed?: boolean
}

interface VipApiErrorBody {
  error?: string
  code?: string
  status?: BigEyeVipStatus
}

export class BigEyeVipError extends Error {
  readonly code: string
  readonly status?: BigEyeVipStatus

  constructor(message: string, code = 'VIP_UNAVAILABLE', status?: BigEyeVipStatus) {
    super(message)
    this.name = 'BigEyeVipError'
    this.code = code
    this.status = status
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getBigEyeVipApiUrl(): string {
  return trimTrailingSlash(import.meta.env.VITE_BIG_EYE_VIP_API_URL?.trim() ?? '')
}

export function isBigEyeVipConfigured(): boolean {
  return getBigEyeVipApiUrl().length > 0
}

function createInstallationId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

export function getBigEyeVipInstallationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_ID_KEY)?.trim()
    if (existing) return existing
    const created = createInstallationId()
    localStorage.setItem(INSTALLATION_ID_KEY, created)
    return created
  } catch {
    return createInstallationId()
  }
}

function vipUrl(path: string): string {
  const base = getBigEyeVipApiUrl()
  if (!base) throw new BigEyeVipError('VIP replies have not been connected yet.')
  return `${base}${path}`
}

async function vipFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), VIP_TIMEOUT_MS)
  try {
    return await fetch(vipUrl(path), {
      ...init,
      headers: {
        'X-Big-Eye-Install-Id': getBigEyeVipInstallationId(),
        ...init.headers,
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof BigEyeVipError) throw error
    throw new BigEyeVipError('The VIP Eye could not be reached. Your credit was kept.')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function parseError(response: Response): Promise<BigEyeVipError> {
  let body: VipApiErrorBody = {}
  try {
    body = (await response.json()) as VipApiErrorBody
  } catch {
    // The API may be temporarily unavailable and return a non-JSON proxy response.
  }
  return new BigEyeVipError(
    body.error || 'The VIP Eye is unavailable. Your credit was kept.',
    body.code || `HTTP_${response.status}`,
    body.status
  )
}

export async function getBigEyeVipStatus(seasonId: string): Promise<BigEyeVipStatus> {
  const response = await vipFetch(
    `/api/vip-confessional/status?seasonId=${encodeURIComponent(seasonId)}`
  )
  if (!response.ok) throw await parseError(response)
  return (await response.json()) as BigEyeVipStatus
}

export async function requestBigEyeVipReply(
  request: BigEyeVipReplyRequest
): Promise<BigEyeVipReply> {
  const requestId = crypto.randomUUID()
  const response = await vipFetch('/api/vip-confessional/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...request,
      requestId,
      diaryText: request.diaryText.slice(0, 600),
      history: request.history.slice(-12),
      memorySummary: request.memorySummary.slice(0, 1800),
    }),
  })
  if (!response.ok) throw await parseError(response)
  return (await response.json()) as BigEyeVipReply
}
