import type { RemoteConfig } from './remoteConfigTypes'

export interface GitHubPublishTarget {
  owner: string
  repo: string
  branch: string
  path: string
}

export interface GitHubPublishResult {
  url: string
  branch: string
  pullRequestNumber?: number
}

const API_ROOT = 'https://api.github.com'

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

async function githubRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || `GitHub returned HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

async function readFileSha(
  token: string,
  target: GitHubPublishTarget,
  branch: string
): Promise<string | undefined> {
  const response = await fetch(
    `${API_ROOT}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodePath(target.path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )
  if (response.status === 404) return undefined
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || `Could not read the existing config (HTTP ${response.status})`)
  }
  const body = (await response.json()) as { sha?: string }
  return body.sha
}

async function writeConfig(
  token: string,
  target: GitHubPublishTarget,
  branch: string,
  config: RemoteConfig
): Promise<{ html_url: string }> {
  const sha = await readFileSha(token, target, branch)
  const response = await githubRequest<{
    content?: { html_url?: string }
    commit: { html_url: string }
  }>(
    token,
    `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodePath(target.path)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Update remote manager configuration',
        content: encodeUtf8Base64(`${JSON.stringify(config, null, 2)}\n`),
        branch,
        ...(sha ? { sha } : {}),
      }),
    }
  )
  return { html_url: response.content?.html_url ?? response.commit.html_url }
}

function createBranchName(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  return `remote-config/${stamp}`
}

export async function publishConfigDirectly(
  token: string,
  target: GitHubPublishTarget,
  config: RemoteConfig
): Promise<GitHubPublishResult> {
  const commit = await writeConfig(token, target, target.branch, config)
  return { url: commit.html_url, branch: target.branch }
}

export async function publishConfigAsPullRequest(
  token: string,
  target: GitHubPublishTarget,
  config: RemoteConfig
): Promise<GitHubPublishResult> {
  const repoPath = `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`
  const base = await githubRequest<{ object: { sha: string } }>(
    token,
    `${repoPath}/git/ref/heads/${encodeURIComponent(target.branch)}`
  )
  const branch = createBranchName()
  await githubRequest(token, `${repoPath}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
  })
  await writeConfig(token, target, branch, config)
  const pullRequest = await githubRequest<{ html_url: string; number: number }>(
    token,
    `${repoPath}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: 'Update remote manager configuration',
        head: branch,
        base: target.branch,
        body: 'Remote configuration update created from the in-game Remote Manager UI.',
      }),
    }
  )
  return { url: pullRequest.html_url, branch, pullRequestNumber: pullRequest.number }
}
