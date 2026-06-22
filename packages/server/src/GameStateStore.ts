import { Effect, Option, SynchronizedRef } from "effect"
import type { GameState as TGameState } from "./gamestate.js"

export class GameStateStore
  extends Effect.Service<GameStateStore>()("server/GameStateStore", {
    effect: (makeInitialGameState: Effect.Effect<TGameState>) =>
      Effect.gen(function*() {
        const stateRef = yield* SynchronizedRef.make<
          Option.Option<TGameState>
        >(Option.none())

        const get = SynchronizedRef.modifyEffect(
          stateRef,
          Option.match({
            onNone: () =>
              makeInitialGameState.pipe(
                Effect.map((initialState) =>
                  [initialState, Option.some(initialState)] as const
                )
              ),
            onSome: (state) => Effect.succeed([state, Option.some(state)])
          })
        )

        const peek = SynchronizedRef.get(stateRef)

        const reset = SynchronizedRef.set(stateRef, Option.none())

        const set = (state: TGameState) =>
          SynchronizedRef.set(stateRef, Option.some(state))

        const modifyEffect = <A, E, R>(
          f: (
            state: TGameState
          ) => Effect.Effect<readonly [A, TGameState], E, R>
        ): Effect.Effect<A, E, R> =>
          SynchronizedRef.modifyEffect(
            stateRef,
            Option.match({
              onNone: () =>
                makeInitialGameState.pipe(
                  Effect.flatMap(f),
                  Effect.map(([result, nextState]) =>
                    [result, Option.some(nextState)] as const
                  )
                ),
              onSome: (state) =>
                f(state).pipe(
                  Effect.map(([result, nextState]) =>
                    [result, Option.some(nextState)] as const
                  )
                )
            })
          )

        return { get, modifyEffect, peek, reset, set } as const
      })
  })
{}
