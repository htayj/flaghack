import { Effect, Ref } from "effect"

export class KeyGenerator
  extends Effect.Service<KeyGenerator>()("server/KeyGenerator", {
    effect: Effect.gen(function*() {
      const nextKeyRef = yield* Ref.make(0)
      const nextKey = Ref.modify(
        nextKeyRef,
        (current) => [`entity-${current}`, current + 1] as const
      )

      return { nextKey } as const
    })
  })
{}

export const CounterKeyGeneratorLive = KeyGenerator.Default
