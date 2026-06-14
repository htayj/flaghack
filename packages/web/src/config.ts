export interface WebApiConfigEnv {
  readonly [name: string]: unknown
  readonly VITE_FLAGHACK_API_URL?: string | undefined
}

export const DEFAULT_WEB_API_BASE_URL = "http://localhost:3000"

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed === "" ? undefined : trimmed
}

export const resolveWebApiBaseUrl = (env: WebApiConfigEnv): string =>
  normalizeEnvValue(env.VITE_FLAGHACK_API_URL) ?? DEFAULT_WEB_API_BASE_URL
