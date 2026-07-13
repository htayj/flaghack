import { describe, expect, it } from "@effect/vitest"
import { GameState } from "@flaghack/domain/schemas"
import { balancedAttributes } from "@flaghack/domain/stats"
import { Effect, HashMap, Option } from "effect"
import type { CampgroundActiveRegion } from "../src/activeRegion.js"
import { applyLazyOffscreenStep } from "../src/offscreen.js"
import type { Entity, World } from "../src/world.js"

const floorAt = (key: string, x: number, y: number): Entity => ({
  _tag: "floor",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const hippieAt = (key: string, x: number, y: number): Entity => ({
  _tag: "hippie",
  at: { x, y, z: 0 },
  attributes: balancedAttributes,
  in: "world",
  key,
  name: key
})

const worldFrom = (entities: ReadonlyArray<Entity>): World =>
  HashMap.fromIterable(entities.map((entity) => [entity.key, entity]))

const emptyWorld = HashMap.empty<string, Entity>()

const activeRegion = (
  offscreenCreatures: ReadonlyArray<Entity>
): CampgroundActiveRegion => ({
  actorBounds: {
    bottomExclusive: 9,
    left: 0,
    rightExclusive: 9,
    top: 0,
    z: 0
  },
  actorWorld: emptyWorld,
  collisionBounds: {
    bottomExclusive: 10,
    left: 0,
    rightExclusive: 10,
    top: 0,
    z: 0
  },
  collisionWorld: emptyWorld,
  offscreenCreatures,
  playerInventory: HashMap.empty(),
  viewport: {
    bottomExclusive: 8,
    left: 0,
    rightExclusive: 8,
    top: 0,
    z: 0
  },
  viewportWorld: emptyWorld
})

describe("lazy offscreen simulation", () => {
  it("moves a budgeted assigned resident using its bounded neighborhood", () => {
    const key = "offscreen-resident"
    const resident = hippieAt(key, 20, 20)
    const neighborhood = [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1].map((dx) =>
        floorAt(
          `floor-${dx}-${dy}`,
          resident.at.x + dx,
          resident.at.y + dy
        )
      )
    )
    const state = GameState.make({
      campground: {
        npcAssignments: [{
          homeAt: { x: 10, y: 10, z: 0 },
          npcKey: key,
          role: "resident"
        }],
        version: 1
      },
      world: worldFrom([...neighborhood, resident])
    })

    const result = Effect.runSync(
      applyLazyOffscreenStep(state, activeRegion([resident]), {
        budget: 1,
        enabled: true
      })
    )
    const moved = Option.getOrUndefined(
      HashMap.get(result.state.world, key)
    )

    expect(moved?.at.z).toBe(0)
    expect(
      Math.abs((moved?.at.x ?? 0) - 10)
        + Math.abs((moved?.at.y ?? 0) - 10)
    ).toBeLessThan(20)
    expect(result.stats).toEqual({
      offscreenBudget: 1,
      offscreenBudgetedCount: 1,
      offscreenCandidateCount: 1,
      offscreenCursor: 0,
      offscreenExecutedCount: 1,
      offscreenNextCursor: 0,
      offscreenSkippedNearActiveCount: 0
    })
    expect(HashMap.size(result.state.world)).toBe(
      HashMap.size(state.world)
    )
  })
})
