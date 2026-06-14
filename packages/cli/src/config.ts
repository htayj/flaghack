export interface CliApiConfigEnv {
  readonly [name: string]: string | undefined
  readonly FLAGHACK_API_URL?: string | undefined
}

export const DEFAULT_CLI_API_BASE_URL = "http://127.0.0.1:3000"

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed === "" ? undefined : trimmed
}

export const resolveCliApiBaseUrl = (env: CliApiConfigEnv): string =>
  normalizeEnvValue(env.FLAGHACK_API_URL) ?? DEFAULT_CLI_API_BASE_URL
