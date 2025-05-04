import { Effect, Logger } from "effect"
import { succeed, suspend } from "effect/Effect"
const _log: Array<string> = []
// export const log = (...m: Array<string>) => {
//   _log.unshift(m.join(" "))
// }
export const log = Effect.log
export const logger = Logger.make(({ message }) => {
  _log.push(`${message}`)
})

export const getLogs = suspend(() => succeed(_log))
