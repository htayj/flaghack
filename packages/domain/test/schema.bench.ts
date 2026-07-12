import {
  hasCreatureCapability,
  HAVE_BRAIN
} from "@flaghack/domain/creatureCapabilities"
import { AnyTerrain, conforms, SAction } from "@flaghack/domain/schemas"
import {
  attributeCheckSucceeds,
  balancedAttributes
} from "@flaghack/domain/stats"
import { Either, Schema as S } from "effect"
import { bench, describe } from "vitest"

const sampleFloor = {
  _tag: "floor" as const,
  key: "floor-1",
  in: "world",
  at: { x: 1, y: 2, z: 0 }
}

const moveAction = { _tag: "move", dir: "S" }
const isTerrain = conforms(AnyTerrain)

describe("domain schema smoke benchmarks", () => {
  bench("checks terrain conformance", () => {
    if (!isTerrain(sampleFloor)) {
      throw new Error("sample floor did not conform to AnyTerrain")
    }
  })

  bench("decodes a move action", () => {
    const result = S.decodeUnknownEither(SAction)(moveAction)
    if (Either.isLeft(result)) {
      throw new Error("sample move action did not decode")
    }
  })

  bench("checks creature capabilities with bitmasks", () => {
    if (!hasCreatureCapability("player", HAVE_BRAIN)) {
      throw new Error("player should have HAVE_BRAIN capability")
    }
  })

  bench("checks attributes without schema decoding", () => {
    if (!attributeCheckSucceeds(balancedAttributes, "wisdom", 10)) {
      throw new Error("balanced wisdom should pass a roll of 10")
    }
  })
})
