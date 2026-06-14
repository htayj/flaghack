export interface ServerRuntimeEnv {
  readonly [name: string]: string | undefined
  readonly FLAGHACK_PORT?: string | undefined
  readonly PORT?: string | undefined
}

export const DEFAULT_SERVER_PORT = 3000

const MIN_PORT = 1
const MAX_PORT = 65535

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed === "" ? undefined : trimmed
}

const portValueFromEnv = (env: ServerRuntimeEnv) => {
  const flaghackPort = normalizeEnvValue(env.FLAGHACK_PORT)
  if (flaghackPort !== undefined) {
    return { name: "FLAGHACK_PORT", value: flaghackPort } as const
  }

  const port = normalizeEnvValue(env.PORT)
  if (port !== undefined) {
    return { name: "PORT", value: port } as const
  }

  return undefined
}

const parsePort = (name: string, value: string) => {
  const port = Number(value)
  if (
    !/^\d+$/.test(value)
    || !Number.isInteger(port)
    || port < MIN_PORT
    || port > MAX_PORT
  ) {
    throw new Error(
      `Invalid ${name} value "${value}". Expected an integer from 1 to 65535.`
    )
  }

  return port
}

export const resolveServerPort = (env: ServerRuntimeEnv): number => {
  const portEnv = portValueFromEnv(env)
  return portEnv === undefined
    ? DEFAULT_SERVER_PORT
    : parsePort(portEnv.name, portEnv.value)
}

export const resolveServerConfig = (env: ServerRuntimeEnv) => ({
  port: resolveServerPort(env)
} as const)
