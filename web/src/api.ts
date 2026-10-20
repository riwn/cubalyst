// Goサーバー（/api）へのクライアント。

export type Health = {
  status: 'ok' | 'error'
  db: 'ok' | 'error'
  schema_version: number
  error?: string
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch('/api/health', { signal })
  const body = (await res.json().catch(() => null)) as Health | null
  if (!body) {
    throw new Error(`HTTP ${res.status}`)
  }
  return body
}
