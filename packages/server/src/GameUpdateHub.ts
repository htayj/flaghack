import {
  ClientStateStreamEvent,
  ClientStateStreamEventName
} from "@flaghack/domain/GameStream"
import type {
  ClientStateStreamSource,
  ClientStateStreamTerminal
} from "@flaghack/domain/GameStream"
import { Effect, HashMap, PubSub, Ref, Stream } from "effect"

type ClientState = ClientStateStreamEvent["clientState"]
type HashMapEntries<T> = T extends HashMap.HashMap<infer K, infer V>
  ? ReadonlyArray<readonly [K, V]>
  : never
type EncodedClientState = {
  [K in keyof ClientState]: K extends "inventory" | "world"
    ? HashMapEntries<ClientState[K]>
    : ClientState[K]
}
type EncodedClientStateStreamEvent =
  & Omit<
    ClientStateStreamEvent,
    "clientState"
  >
  & {
    readonly clientState: EncodedClientState
  }

const textEncoder = new TextEncoder()

/**
 * ClientState's only non-JSON wire transforms are its two HashMaps. Keeping
 * this conversion explicit avoids revalidating every viewport entity on each
 * streamed turn; the schema-parity test must evolve with future transforms.
 */
const encodeClientStateStreamEvent = (
  event: ClientStateStreamEvent
): EncodedClientStateStreamEvent => ({
  clientState: {
    campground: event.clientState.campground,
    gameplayEvents: event.clientState.gameplayEvents,
    inventory: Array.from(event.clientState.inventory),
    roles: event.clientState.roles,
    setup: event.clientState.setup,
    world: Array.from(event.clientState.world)
  },
  ...(event.previousRevision === undefined
    ? {}
    : { previousRevision: event.previousRevision }),
  revision: event.revision,
  source: event.source,
  ...(event.terminal === undefined ? {} : { terminal: event.terminal })
})

export const encodeClientStateSseEvent = (
  event: ClientStateStreamEvent
): string => {
  const payload = encodeClientStateStreamEvent(event)
  return [
    `id: ${event.revision}`,
    `event: ${ClientStateStreamEventName}`,
    `data: ${JSON.stringify(payload)}`,
    ""
  ].join("\n") + "\n"
}

export const encodeClientStateSseEventBytes = (
  event: ClientStateStreamEvent
): Uint8Array => textEncoder.encode(encodeClientStateSseEvent(event))

export class GameUpdateHub
  extends Effect.Service<GameUpdateHub>()("server/GameUpdateHub", {
    scoped: Effect.gen(function*() {
      const revisionRef = yield* Ref.make(0)
      const pubsub = yield* PubSub.sliding<ClientStateStreamEvent>({
        capacity: 256,
        replay: 16
      })

      yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

      const currentRevision = Ref.get(revisionRef)
      const makeClientStateEvent = (
        source: ClientStateStreamSource,
        clientState: ClientState,
        terminal?: ClientStateStreamTerminal | undefined
      ) =>
        currentRevision.pipe(
          Effect.map((revision) => ({
            clientState,
            revision,
            source,
            ...(terminal === undefined ? {} : { terminal })
          } satisfies ClientStateStreamEvent))
        )

      const publishClientState = (
        source: ClientStateStreamSource,
        clientState: ClientState,
        terminal?: ClientStateStreamTerminal | undefined
      ) =>
        Ref.modify(revisionRef, (previousRevision) => {
          const revision = previousRevision + 1
          return [
            {
              clientState,
              previousRevision,
              revision,
              source,
              ...(terminal === undefined ? {} : { terminal })
            } satisfies ClientStateStreamEvent,
            revision
          ] as const
        }).pipe(
          Effect.tap((event) => PubSub.publish(pubsub, event))
        )

      const clientStateEvents = Stream.unwrapScoped(
        PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromQueue))
      )

      return {
        clientStateEvents,
        currentRevision,
        makeClientStateEvent,
        publishClientState
      } as const
    })
  })
{}
