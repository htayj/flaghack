export interface CliApiConfigEnv {
  readonly [name: string]: string | undefined
  readonly FLAGHACK_API_URL?: string | undefined
  readonly FLAGHACK_DEBUG_MESSAGES?: string | undefined
}

export const DEFAULT_CLI_API_BASE_URL = "http://127.0.0.1:3000"

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed === "" ? undefined : trimmed
}

const truthyFlagValues = new Set(["1", "true", "yes", "on"])

const isTruthyFlagValue = (value: string | undefined): boolean => {
  const normalized = normalizeEnvValue(value)?.toLowerCase()
  return normalized === undefined
    ? false
    : truthyFlagValues.has(normalized)
}

export const resolveCliApiBaseUrl = (env: CliApiConfigEnv): string =>
  normalizeEnvValue(env.FLAGHACK_API_URL) ?? DEFAULT_CLI_API_BASE_URL

export const resolveCliDebugMessages = (
  args: ReadonlyArray<string>,
  env: CliApiConfigEnv
): boolean => {
  let debugMessages = isTruthyFlagValue(env.FLAGHACK_DEBUG_MESSAGES)

  for (const rawArg of args) {
    const arg = rawArg.trim()
    if (arg === "--debug-messages" || arg === "--debug") {
      debugMessages = true
      continue
    }
    if (arg === "--no-debug-messages") {
      debugMessages = false
      continue
    }

    const [name, value] = arg.split("=", 2)
    if (name === "--debug-messages" || name === "--debug") {
      debugMessages = isTruthyFlagValue(value)
    }
  }

  return debugMessages
}
