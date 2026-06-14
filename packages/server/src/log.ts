import { Effect, Logger } from "effect"
import { succeed, suspend } from "effect/Effect"

export const MAX_LOG_ENTRIES = 50

let logEntries: ReadonlyArray<string> = []
// export const log = (...m: Array<string>) => {
//   logEntries = [m.join(" "), ...logEntries]
// }
export const log = Effect.log
export const logger = Logger.make(({ message }) => {
  logEntries = [`${message}`, ...logEntries].slice(0, MAX_LOG_ENTRIES)
})

export const getLogs = suspend(() => succeed([...logEntries]))
