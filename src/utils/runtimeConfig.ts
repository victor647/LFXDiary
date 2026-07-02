export type NasProxyMode = 'auto' | 'direct' | 'same-origin'

type RuntimeConfig = {
  nasProxy?: NasProxyMode
  nasProxyBasePaths?: {
    lan?: string
    public?: string
  }
}

declare global {
  interface Window {
    __LFX_DIARY_RUNTIME__?: RuntimeConfig
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined')
    return {}

  return window.__LFX_DIARY_RUNTIME__ ?? {}
}

export function getRuntimeNasProxyMode(): NasProxyMode {
  const mode = getRuntimeConfig().nasProxy

  return mode === 'direct' || mode === 'same-origin' ? mode : 'auto'
}

export function getRuntimeNasProxyBasePath(mode: 'lan' | 'public'): string {
  const configuredPath = getRuntimeConfig().nasProxyBasePaths?.[mode]
  const fallbackPath = mode === 'lan' ? 'nas-lan-api/' : 'nas-public-api/'
  const path = configuredPath?.trim() || fallbackPath

  return path.endsWith('/') ? path : `${path}/`
}
