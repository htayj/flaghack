import { Effect, Logger } from "effect"
import { succeed, suspend } from "effect/Effect"

let logEntries: ReadonlyArray<string> = []
// export const log = (...m: Array<string>) => {
//   logEntries = [m.join(" "), ...logEntries]
// }
export const log = Effect.log
export const logger = Logger.make(({ message }) => {
  logEntries = [...logEntries, `${message}`]
})

export const getLogs = suspend(() => succeed([...logEntries]))
