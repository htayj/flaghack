import { isCreatureTag } from "@flaghack/domain/creatureCapabilities"
import { GameState } from "@flaghack/domain/schemas"
import { balancedAttributes } from "@flaghack/domain/stats"
import { Data, Effect, Either, Option, Schema } from "effect"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

export type TGameState = typeof GameState.Type

export class GamePersistenceError
  extends Data.TaggedError("GamePersistenceError")<{
    readonly cause: unknown
    readonly operation: string
    readonly path: string
  }>
{
  get message(): string {
    return `Game persistence ${this.operation} failed for ${this.path}`
  }
}

const persistenceError = (
  operation: string,
  path: string,
  cause: unknown
): GamePersistenceError =>
  new GamePersistenceError({ cause, operation, path })

const isNodeErrorWithCode = (
  error: unknown,
  code: string
): error is NodeJS.ErrnoException =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { readonly code?: unknown }).code === code

let temporarySaveCounter = 0

const temporarySavePath = (saveFilePath: string): string => {
  temporarySaveCounter += 1
  return join(
    dirname(saveFilePath),
    `.${basename(saveFilePath)}.${process.pid}.${temporarySaveCounter}.tmp`
  )
}

const encodeGameState = (state: TGameState) =>
  Effect.try({
    catch: (cause) => persistenceError("encode", "<memory>", cause),
    try: () => Schema.encodeSync(GameState)(state)
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const migrateLegacyCreatureEntity = (entity: unknown): unknown => {
  if (!isRecord(entity) || typeof entity._tag !== "string") {
    return entity
  }
  if (!isCreatureTag(entity._tag) || hasOwn(entity, "attributes")) {
    return entity
  }

  return { ...entity, attributes: balancedAttributes }
}

const migrateLegacySavePayload = (payload: unknown): unknown => {
  if (!isRecord(payload) || !Array.isArray(payload.world)) {
    return payload
  }

  let changed = false
  const world = payload.world.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return entry
    }

    const migratedEntity = migrateLegacyCreatureEntity(entry[1])
    if (migratedEntity === entry[1]) {
      return entry
    }

    changed = true
    return [entry[0], migratedEntity]
  })

  return changed ? { ...payload, world } : payload
}

const decodeGameState = (saveFilePath: string, raw: string) =>
  Effect.try({
    catch: (cause) => persistenceError("decode", saveFilePath, cause),
    try: () =>
      Schema.decodeUnknownSync(GameState)(
        migrateLegacySavePayload(JSON.parse(raw))
      )
  })

export class GamePersistence
  extends Effect.Service<GamePersistence>()("server/GamePersistence", {
    effect: (saveFilePath: string) =>
      Effect.sync(() => {
        const deleteSave = Effect.tryPromise({
          catch: (cause) =>
            persistenceError("delete", saveFilePath, cause),
          try: () => rm(saveFilePath, { force: true })
        })

        const readSaveFile = Effect.tryPromise({
          catch: (cause) => persistenceError("read", saveFilePath, cause),
          try: async () => {
            try {
              return Option.some(await readFile(saveFilePath, "utf8"))
            } catch (error) {
              if (isNodeErrorWithCode(error, "ENOENT")) {
                return Option.none<string>()
              }
              throw error
            }
          }
        })

        const save = (state: TGameState) =>
          Effect.gen(function*() {
            const encoded = yield* encodeGameState(state)
            const payload = `${JSON.stringify(encoded)}\n`
            const parentDir = dirname(saveFilePath)
            const tempPath = temporarySavePath(saveFilePath)

            yield* Effect.tryPromise({
              catch: (cause) =>
                persistenceError("save", saveFilePath, cause),
              try: async () => {
                try {
                  await mkdir(parentDir, { recursive: true })
                  await writeFile(tempPath, payload, {
                    encoding: "utf8",
                    mode: 0o600
                  })
                  await rename(tempPath, saveFilePath)
                } catch (error) {
                  try {
                    await rm(tempPath, { force: true })
                  } catch {
                    // Best-effort cleanup after failed atomic write.
                  }
                  throw error
                }
              }
            })
          })

        const restorePreserving = Effect.gen(function*() {
          const maybeRaw = yield* readSaveFile
          if (Option.isNone(maybeRaw)) {
            return Option.none<TGameState>()
          }

          const decoded = yield* Effect.either(
            decodeGameState(saveFilePath, maybeRaw.value)
          )
          if (Either.isLeft(decoded)) {
            yield* deleteSave
            return Option.none<TGameState>()
          }

          return Option.some(decoded.right)
        })

        const restoreAndConsume = Effect.gen(function*() {
          const restored = yield* restorePreserving
          if (Option.isSome(restored)) {
            yield* deleteSave
          }
          return restored
        })

        return {
          deleteSave,
          restoreAndConsume,
          restorePreserving,
          save,
          saveFilePath
        } as const
      })
  })
{}
