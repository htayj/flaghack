import {
  ClientStateStreamEvent,
  ClientStateStreamEventName
} from "@flaghack/domain/GameStream"
import type {
  ClientStateStreamSource,
  ClientStateStreamTerminal
} from "@flaghack/domain/GameStream"
import { Effect, PubSub, Ref, Schema, Stream } from "effect"

type ClientState = ClientStateStreamEvent["clientState"]

const textEncoder = new TextEncoder()

export const encodeClientStateSseEvent = (
  event: ClientStateStreamEvent
): string => {
  const payload = Schema.encodeSync(ClientStateStreamEvent)(event)
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
