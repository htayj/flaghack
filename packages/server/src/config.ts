import { Data, Effect, Option } from "effect"

export interface ServerRuntimeEnv {
  readonly [name: string]: string | undefined
  readonly FLAGHACK_PORT?: string | undefined
  readonly PORT?: string | undefined
}

export type ServerConfig = {
  readonly port: number
}

type ServerPortEnvValue = {
  readonly envVar: "FLAGHACK_PORT" | "PORT"
  readonly value: string
}

export class InvalidServerPort
  extends Data.TaggedError("InvalidServerPort")<{
    readonly envVar: string
    readonly value: string
  }>
{
  get message(): string {
    return `Invalid ${this.envVar} value "${this.value}". Expected an integer from 1 to 65535.`
  }
}

export const DEFAULT_SERVER_PORT = 3000

const MIN_PORT = 1
const MAX_PORT = 65535

const normalizeEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed === "" ? undefined : trimmed
}

const portValueFromEnv = (
  env: ServerRuntimeEnv
): Option.Option<ServerPortEnvValue> => {
  const flaghackPort = normalizeEnvValue(env.FLAGHACK_PORT)
  if (flaghackPort !== undefined) {
    return Option.some({ envVar: "FLAGHACK_PORT", value: flaghackPort })
  }

  const port = normalizeEnvValue(env.PORT)
  if (port !== undefined) {
    return Option.some({ envVar: "PORT", value: port })
  }

  return Option.none()
}

const invalidServerPort = (envVar: string, value: string) =>
  new InvalidServerPort({ envVar, value })

const parsePortEffect = (
  envVar: string,
  value: string
): Effect.Effect<number, InvalidServerPort> => {
  const port = Number(value)
  const isValidPort = /^\d+$/.test(value)
    && Number.isInteger(port)
    && port >= MIN_PORT
    && port <= MAX_PORT

  return isValidPort
    ? Effect.succeed(port)
    : Effect.fail(invalidServerPort(envVar, value))
}

export const resolveServerPortEffect = (
  env: ServerRuntimeEnv
): Effect.Effect<number, InvalidServerPort> =>
  Option.match(portValueFromEnv(env), {
    onNone: () => Effect.succeed(DEFAULT_SERVER_PORT),
    onSome: ({ envVar, value }) => parsePortEffect(envVar, value)
  })

export const resolveServerPort = (env: ServerRuntimeEnv): number =>
  Effect.runSync(resolveServerPortEffect(env))

export const resolveServerConfigEffect = (
  env: ServerRuntimeEnv
): Effect.Effect<ServerConfig, InvalidServerPort> =>
  resolveServerPortEffect(env).pipe(
    Effect.map((port) => ({ port } as const))
  )

export const resolveServerConfig = (env: ServerRuntimeEnv): ServerConfig =>
  Effect.runSync(resolveServerConfigEffect(env))
