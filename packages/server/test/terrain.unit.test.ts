import { describe, expect, it } from "@effect/vitest"
import { CampPropKinds } from "@flaghack/domain/schemas"
import { Effect } from "effect"
import { CounterKeyGeneratorLive } from "../src/keyGenerator.js"
import {
  campProp,
  type CampPropKind,
  isCampPropPassable,
  isTerrain,
  makeCampProp,
  makeMud,
  makeTentDoor,
  mud,
  tentDoor
} from "../src/terrain.js"

const expectedPassability: Record<CampPropKind, boolean> = {
  "arrival-gate": true,
  artwork: false,
  flagpole: false,
  stage: true,
  workbench: false,
  "bike-rack": false,
  directory: true,
  "water-station": false,
  speaker: false,
  lantern: true,
  table: false
}

describe("camp props", () => {
  it("constructs every finite camp prop kind as schema terrain", () => {
    for (const [index, kind] of CampPropKinds.entries()) {
      const prop = makeCampProp(`camp-prop-${index}`, index, 2, 0, kind)

      expect(prop).toEqual({
        _tag: "camp-prop",
        at: { x: index, y: 2, z: 0 },
        in: "world",
        key: `camp-prop-${index}`,
        kind
      })
      expect(isTerrain(prop)).toBe(true)
      expect(isCampPropPassable(kind)).toBe(expectedPassability[kind])
    }
  })

  it("allocates deterministic keys through the reusable camp prop factory", () => {
    const props = Effect.runSync(
      Effect.forEach(
        CampPropKinds,
        (kind, index) => campProp(index, 3, 0, kind),
        { concurrency: 1 }
      ).pipe(Effect.provide(CounterKeyGeneratorLive))
    )

    expect(props.map(({ key }) => key)).toEqual(
      CampPropKinds.map((_, index) => `entity-${index}`)
    )
    expect(props.map(({ kind }) => kind)).toEqual(CampPropKinds)
  })
})

describe("mud", () => {
  it("constructs mud as schema terrain", () => {
    const terrain = makeMud("mud-1", 4, 5, 0)

    expect(terrain).toEqual({
      _tag: "mud",
      at: { x: 4, y: 5, z: 0 },
      in: "world",
      key: "mud-1"
    })
    expect(isTerrain(terrain)).toBe(true)
  })

  it("allocates deterministic keys through the mud factory", () => {
    const terrain = Effect.runSync(
      mud(4, 5, 0).pipe(Effect.provide(CounterKeyGeneratorLive))
    )

    expect(terrain).toEqual(makeMud("entity-0", 4, 5, 0))
  })
})

describe("tent doors", () => {
  it("constructs a tent-kind door as schema terrain", () => {
    const terrain = makeTentDoor(
      "tent-door-1",
      4,
      5,
      0,
      false,
      "horizontal"
    )

    expect(terrain).toEqual({
      _tag: "door",
      at: { x: 4, y: 5, z: 0 },
      in: "world",
      key: "tent-door-1",
      kind: "tent",
      open: false,
      variant: "horizontal"
    })
    expect(isTerrain(terrain)).toBe(true)
  })

  it("allocates deterministic keys through the tent door factory", () => {
    const terrain = Effect.runSync(
      tentDoor(4, 5, 0, false, "horizontal").pipe(
        Effect.provide(CounterKeyGeneratorLive)
      )
    )

    expect(terrain).toEqual(
      makeTentDoor("entity-0", 4, 5, 0, false, "horizontal")
    )
  })
})
