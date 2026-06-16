import { describe, expect, it } from "@effect/vitest"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import {
  BSPGenLevel,
  CampgroundGenLevel,
  type Entity,
  itemsAt,
  makeBspLevel,
  type World
} from "../src/world.js"

const coordinateKey = ({ at }: Entity): string => `${at.x},${at.y},${at.z}`

const cardinalRoadNeighborKeys = (
  entity: Entity
): ReadonlyArray<string> => [
  `${entity.at.x + 1},${entity.at.y},${entity.at.z}`,
  `${entity.at.x - 1},${entity.at.y},${entity.at.z}`,
  `${entity.at.x},${entity.at.y + 1},${entity.at.z}`,
  `${entity.at.x},${entity.at.y - 1},${entity.at.z}`
]

const roadGraphStats = (roads: ReadonlyArray<Entity>) => {
  const roadKeys = new Set(roads.map(coordinateKey))
  const visited = new Set<string>()
  let components = 0
  let directedEdgeCount = 0

  for (const road of roads) {
    directedEdgeCount += cardinalRoadNeighborKeys(road).filter((key) =>
      roadKeys.has(key)
    ).length
  }

  for (const road of roads) {
    const startKey = coordinateKey(road)
    if (visited.has(startKey)) continue

    components += 1
    const stack: Array<Entity> = [road]
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === undefined) continue

      const currentKey = coordinateKey(current)
      if (visited.has(currentKey)) continue
      visited.add(currentKey)

      for (const neighborKey of cardinalRoadNeighborKeys(current)) {
        if (!roadKeys.has(neighborKey) || visited.has(neighborKey)) {
          continue
        }
        const neighbor = roads.find((candidate) =>
          coordinateKey(candidate) === neighborKey
        )
        if (neighbor !== undefined) stack.push(neighbor)
      }
    }
  }

  return {
    components,
    edges: directedEdgeCount / 2,
    nodes: roads.length
  }
}

const samePosition = (a: Entity, b: Entity): boolean =>
  a.at.x === b.at.x && a.at.y === b.at.y && a.at.z === b.at.z

const manhattanDistance = (a: Entity, b: Entity): number =>
  Math.abs(a.at.x - b.at.x) + Math.abs(a.at.y - b.at.y)

const refrigeratedCampFoodTags = new Set(["hotdog", "cheese", "salsa"])
const coolerContentTags = new Set([
  "beer",
  ...refrigeratedCampFoodTags
])
const campgroundHumanDisplayNames = [
  "Alex",
  "Dusty",
  "Maya",
  "Sparkle Pony",
  "River",
  "Moonbeam",
  "Jordan",
  "Captain Snacks",
  "Sam",
  "Glitterbug",
  "Taylor",
  "Pickle",
  "Casey",
  "Sunshine",
  "Morgan",
  "Firefly"
] as const

describe("CampgroundGenLevel", () => {
  it("generates a deterministic burn campground with interconnected road loop features", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const repeatWorld = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const repeatEntities = Array.from(repeatWorld.pipe(HashMap.values))
    const roads = entities.filter((entity) => entity._tag === "tunnel")
    const fields = entities.filter((entity) => entity._tag === "floor")
    const tents = entities.filter((entity) => entity._tag === "tent")
    const signs = entities.filter((entity) => entity._tag === "sign")
    const effigies = entities.filter((entity) => entity._tag === "effigy")
    const temples = entities.filter((entity) => entity._tag === "temple")
    const roadStats = roadGraphStats(roads)
    const zLevels = [...new Set(entities.map(({ at }) => at.z))].sort(
      (a, b) => a - b
    )

    expect(repeatEntities).toEqual(entities)
    expect(zLevels).toEqual([0])
    expect(fields.length).toBeGreaterThan(roads.length)
    expect(tents.length).toBeGreaterThanOrEqual(9)
    expect(signs.length).toBeGreaterThanOrEqual(3)
    expect(signs.every((sign) => sign.name.trim().length > 0)).toBe(true)
    expect(effigies.length).toBeGreaterThanOrEqual(5)
    expect(temples).toHaveLength(1)
    expect(roadStats.components).toBe(1)
    expect(roadStats.edges).toBeGreaterThanOrEqual(roadStats.nodes)
  })

  it("builds a campground larger than the fixed viewport with an enterable temple structure", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const xs = entities.map((entity) => entity.at.x)
    const ys = entities.map((entity) => entity.at.y)
    const temple = entities.find((entity) => entity._tag === "temple")

    expect(Math.max(...xs) - Math.min(...xs) + 1).toBeGreaterThan(80)
    expect(Math.max(...ys) - Math.min(...ys) + 1).toBeGreaterThan(20)
    expect(temple).toBeDefined()
    if (temple === undefined) return

    const nearbyWalls = entities.filter((entity) =>
      entity._tag === "wall"
      && entity.at.z === temple.at.z
      && Math.abs(entity.at.x - temple.at.x) <= 7
      && Math.abs(entity.at.y - temple.at.y) <= 5
    )
    const adjacentInteriorFloors = entities.filter((entity) =>
      entity._tag === "floor"
      && entity.at.z === temple.at.z
      && Math.abs(entity.at.x - temple.at.x) <= 1
      && Math.abs(entity.at.y - temple.at.y) <= 1
    )

    expect(nearbyWalls.length).toBeGreaterThan(12)
    expect(adjacentInteriorFloors.length).toBeGreaterThan(0)
  })

  it("spawns camp coolers containing mostly beer and refrigerated camp food", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const coolers = entities.filter((entity) => entity._tag === "cooler")
    const signs = entities.filter((entity) => entity._tag === "sign")
    const campMarkers = entities.filter((entity) =>
      entity._tag === "sign" || entity._tag === "tent"
    )

    expect(coolers.length).toBeGreaterThanOrEqual(signs.length)
    expect(coolers.every((cooler) => cooler.in === "world")).toBe(true)

    for (const cooler of coolers) {
      const terrainAtCooler = entities.find((entity) =>
        entity.in === "world"
        && entity._tag === "floor"
        && samePosition(entity, cooler)
      )
      const nearestCampDistance = Math.min(
        ...campMarkers.map((marker) => manhattanDistance(cooler, marker))
      )
      const contents = entities.filter((entity) =>
        entity.in === cooler.key
      )
      const beerCount = contents.filter((entity) => entity._tag === "beer")
        .length
      const groundItemsAtCooler = Array.from(
        itemsAt(world)(cooler.at).pipe(HashMap.values)
      ).filter((item) => item.key !== cooler.key)

      expect(terrainAtCooler).toBeDefined()
      expect(nearestCampDistance).toBeLessThanOrEqual(6)
      expect(contents.length).toBeGreaterThanOrEqual(6)
      expect(
        contents.every((entity) => coolerContentTags.has(entity._tag))
      )
        .toBe(true)
      expect(beerCount).toBeGreaterThan(contents.length - beerCount)
      expect(contents.some((entity) => entity._tag === "beer")).toBe(true)
      expect(
        contents.some((entity) =>
          refrigeratedCampFoodTags.has(entity._tag)
        )
      ).toBe(true)
      expect(contents.every((entity) => entity.in === cooler.key)).toBe(
        true
      )
      expect(groundItemsAtCooler).toHaveLength(0)
    }
  })

  it("spawns mostly hippies plus named humans on floor or road tiles", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const campgroundNpcs = entities.filter((entity) =>
      entity.in === "world"
      && (entity._tag === "hippie" || entity._tag === "ranger")
    )
    const hippies = campgroundNpcs.filter((entity) =>
      entity._tag === "hippie"
    )
    const namedHumans = campgroundNpcs.filter((entity) =>
      entity._tag === "ranger"
    )
    const allowedNames = new Set<string>(campgroundHumanDisplayNames)
    const passableFloorOrRoadPositions = new Set(
      entities.filter((entity) =>
        entity.in === "world"
        && (entity._tag === "floor" || entity._tag === "tunnel")
      ).map(coordinateKey)
    )
    const campBlockerPositions = new Set(
      entities.filter((entity) =>
        entity.in === "world"
        && (
          entity._tag === "wall"
          || entity._tag === "tent"
          || entity._tag === "sign"
          || entity._tag === "effigy"
          || entity._tag === "temple"
          || entity._tag === "cooler"
        )
      ).map(coordinateKey)
    )
    const npcPositions = new Set(campgroundNpcs.map(coordinateKey))

    expect(campgroundNpcs.length).toBeGreaterThan(0)
    expect(hippies.length).toBeGreaterThan(namedHumans.length)
    expect(hippies.length).toBeGreaterThan(campgroundNpcs.length / 2)
    expect(namedHumans.length).toBeGreaterThan(0)
    expect(npcPositions.size).toBe(campgroundNpcs.length)

    for (const npc of campgroundNpcs) {
      expect(npc.in).toBe("world")
      expect(passableFloorOrRoadPositions.has(coordinateKey(npc))).toBe(
        true
      )
      expect(campBlockerPositions.has(coordinateKey(npc))).toBe(false)
    }

    for (const namedHuman of namedHumans) {
      expect(namedHuman.name?.trim().length ?? 0).toBeGreaterThan(0)
      expect(allowedNames.has(namedHuman.name ?? "")).toBe(true)
      expect(Object.keys(namedHuman).sort()).toEqual([
        "_tag",
        "at",
        "in",
        "key",
        "name"
      ])
    }
  })
})

describe("BSPGenLevel", () => {
  it("does not use a tuple assertion in randBool", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyTupleAssertion = [
      "as [boolean,",
      " prand.RandomGenerator]"
    ].join("")

    expect(worldSource).not.toContain(legacyTupleAssertion)
  })

  it("uses checked indexing in leaf linking", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyIndexingSnippets = [
      "floorsB[0]",
      "yIntersect.toArray()[i]",
      "xIntersect.toArray()[i]",
      "floorsA[ia]",
      "floorsB[ib]"
    ]

    for (const snippet of legacyIndexingSnippets) {
      expect(worldSource).not.toContain(snippet)
    }
  })

  it("uses Array.some for leaf-linking existence checks", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyFindSnippets = [
      ["!!floorsA.", "find("].join(""),
      ["!!floorsB.", "find("].join("")
    ]

    for (const snippet of legacyFindSnippets) {
      expect(worldSource).not.toContain(snippet)
    }
  })

  it("uses long-form array types in world helper signatures", () => {
    const worldSource = readFileSync(
      new URL("../src/world.ts", import.meta.url),
      "utf8"
    )
    const legacyArrayShorthandSnippets = [
      ["arr: ", "T", "[]"].join(""),
      ["number", "[]"].join("")
    ]

    for (const snippet of legacyArrayShorthandSnippets) {
      expect(worldSource).not.toContain(snippet)
    }
  })

  it("places every generated entity on the requested dungeon level", () => {
    const dlvl = 7
    const world = Effect.runSync(BSPGenLevel(777, dlvl))
    const entities = Array.from(world.pipe(HashMap.values))

    const zLevels = [...new Set(entities.map(({ at }) => at.z))].sort(
      (a, b) => a - b
    )

    expect(entities.length).toBeGreaterThan(0)
    expect(zLevels).toEqual([dlvl])
  })

  it("returns Effect values for unseeded and seeded BSP generation", () => {
    const seededLevel = BSPGenLevel(777, 0)
    const unseededLevel = makeBspLevel(0)

    expect(Effect.isEffect(seededLevel)).toBe(true)
    expect(Effect.isEffect(unseededLevel)).toBe(true)
  })

  it("generates deterministic worlds for the same seed and dungeon level", () => {
    const serialize = (world: World) =>
      Array.from(world.pipe(HashMap.values)).sort((a, b) => {
        if (a.key < b.key) return -1
        if (a.key > b.key) return 1
        return 0
      })

    const first = Effect.runSync(BSPGenLevel(4242, 3))
    const second = Effect.runSync(BSPGenLevel(4242, 3))

    expect(serialize(second)).toEqual(serialize(first))
  })

  it("keeps level generation free of pure-rand and hidden UUID keys", () => {
    const sourceUrls = [
      "../src/world.ts",
      "../src/terrain.ts",
      "../src/items.ts",
      "../src/creatures.ts"
    ] as const

    for (const sourceUrl of sourceUrls) {
      const source = readFileSync(
        new URL(sourceUrl, import.meta.url),
        "utf8"
      )

      expect(source).not.toContain("pure-rand")
      expect(source).not.toContain("randomUUID")
      expect(source).not.toContain("genKey")
    }
  })
})
