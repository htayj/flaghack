import { Schema } from "effect"
import { ClientState } from "./schemas.js"

export const GameStateStreamPath = "/client-state/stream"
export const ClientStateStreamEventName = "client-state"

export const ClientStateStreamSource = Schema.Literal(
  "initial",
  "action",
  "setup",
  "save",
  "restore",
  "quit"
)

export const ClientStateStreamTerminal = Schema.Literal("save", "quit")

export const ClientStateStreamEvent = Schema.Struct({
  clientState: ClientState,
  previousRevision: Schema.Number.pipe(Schema.optional),
  revision: Schema.Number,
  source: ClientStateStreamSource,
  terminal: ClientStateStreamTerminal.pipe(Schema.optional)
})

export const decodeClientStateStreamEvent = Schema.decodeUnknownSync(
  ClientStateStreamEvent
)

export const parseClientStateStreamEventJson = (json: string) =>
  decodeClientStateStreamEvent(JSON.parse(json) as unknown)

export const shouldAcceptClientStateStreamRevision = (
  lastRevision: number,
  nextRevision: number
): boolean => nextRevision > lastRevision

export type ClientStateStreamSource = typeof ClientStateStreamSource.Type
export type ClientStateStreamTerminal =
  typeof ClientStateStreamTerminal.Type
export type ClientStateStreamEvent = typeof ClientStateStreamEvent.Type
