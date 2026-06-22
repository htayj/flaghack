import { describe, expect, it } from "@effect/vitest"
import { AnyCreature, AnyItem, conforms } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import {
  BSPGenLevel,
  CampgroundGenLevel,
  campgroundReservedTravelCorridorCoordinates,
  type Entity,
  isCreature,
  isImpassable,
  isItem,
  isPassableTerrain,
  isTerrain,
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

const passableTerrainTags = new Set([
  "floor",
  "tunnel",
  "tent",
  "sign",
  "effigy",
  "temple"
])

const cardinalNeighborCoordinateKeys = (key: string): Array<string> => {
  const [rawX, rawY, rawZ] = key.split(",")
  const x = Number(rawX)
  const y = Number(rawY)
  const z = Number(rawZ)

  return [
    `${x + 1},${y},${z}`,
    `${x - 1},${y},${z}`,
    `${x},${y + 1},${z}`,
    `${x},${y - 1},${z}`
  ]
}

const reachablePassableCoordinateKeys = (
  entities: ReadonlyArray<Entity>,
  startKey: string
): Set<string> => {
  const passableKeys = new Set(
    entities.filter((entity) =>
      entity.in === "world" && passableTerrainTags.has(entity._tag)
    ).map(coordinateKey)
  )
  for (
    const blockerKey of entities.filter((entity) =>
      entity.in === "world"
      && (
        entity._tag === "wall"
        || entity._tag === "tent-wall"
        || entity._tag === "tent-post"
      )
    ).map(coordinateKey)
  ) {
    passableKeys.delete(blockerKey)
  }
  const reachable = new Set<string>()
  const queue = passableKeys.has(startKey) ? [startKey] : []

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || reachable.has(current)) continue
    reachable.add(current)

    for (const neighbor of cardinalNeighborCoordinateKeys(current)) {
      if (passableKeys.has(neighbor) && !reachable.has(neighbor)) {
        queue.push(neighbor)
      }
    }
  }

  return reachable
}

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

const doorAt = (
  key: string,
  x: number,
  y: number,
  open: boolean
): Entity => ({
  _tag: "door",
  at: { x, y, z: 0 },
  in: "world",
  key,
  open,
  variant: "vertical"
})

describe("world entity predicates", () => {
  it("classifies closed doors as impassable and open doors as passable terrain", () => {
    const closedDoor = doorAt("door-closed", 1, 0, false)
    const openDoor = doorAt("door-open", 2, 0, true)

    expect(isTerrain(closedDoor)).toBe(true)
    expect(isImpassable(closedDoor)).toBe(true)
    expect(isPassableTerrain(closedDoor)).toBe(false)
    expect(isTerrain(openDoor)).toBe(true)
    expect(isImpassable(openDoor)).toBe(false)
    expect(isPassableTerrain(openDoor)).toBe(true)
  })

  it("classifies tent wall and post terrain as impassable blockers", () => {
    const blockers = [
      {
        _tag: "tent-wall" as const,
        at: { x: 1, y: 0, z: 0 },
        in: "world",
        key: "tent-wall-1",
        variant: "vertical" as const
      },
      {
        _tag: "tent-post" as const,
        at: { x: 2, y: 0, z: 0 },
        in: "world",
        key: "tent-post-1"
      }
    ] satisfies ReadonlyArray<Entity>

    for (const blocker of blockers) {
      expect(isTerrain(blocker)).toBe(true)
      expect(isImpassable(blocker)).toBe(true)
      expect(isPassableTerrain(blocker)).toBe(false)
    }
  })

  it("match schema guards for generated campground entities", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const schemaIsCreature = conforms(AnyCreature)
    const schemaIsItem = conforms(AnyItem)

    for (const entity of entities) {
      expect(isCreature(entity)).toBe(schemaIsCreature(entity))
      expect(isItem(entity)).toBe(schemaIsItem(entity))
    }
  })
})

describe("CampgroundGenLevel", () => {
  it("generates a deterministic 10x-area burn campground with many camps and looped roads", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const repeatWorld = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const repeatEntities = Array.from(repeatWorld.pipe(HashMap.values))
    const roads = entities.filter((entity) => entity._tag === "tunnel")
    const fields = entities.filter((entity) => entity._tag === "floor")
    const signs = entities.filter((entity) => entity._tag === "sign")
    const coolers = entities.filter((entity) => entity._tag === "cooler")
    const effigies = entities.filter((entity) => entity._tag === "effigy")
    const temples = entities.filter((entity) => entity._tag === "temple")
    const xs = entities.map((entity) => entity.at.x)
    const ys = entities.map((entity) => entity.at.y)
    const width = Math.max(...xs) - Math.min(...xs) + 1
    const height = Math.max(...ys) - Math.min(...ys) + 1
    const originalArea = 120 * 48
    const roadStats = roadGraphStats(roads)
    const zLevels = [...new Set(entities.map(({ at }) => at.z))].sort(
      (a, b) => a - b
    )

    expect(repeatEntities).toEqual(entities)
    expect(zLevels).toEqual([0])
    expect(width * height).toBeGreaterThanOrEqual(originalArea * 10)
    expect(width * height).toBeLessThanOrEqual(originalArea * 20)
    expect(width).toBeGreaterThanOrEqual(300)
    expect(height).toBeGreaterThanOrEqual(140)
    expect(fields.length).toBeGreaterThan(roads.length)
    expect(signs.length).toBeGreaterThanOrEqual(24)
    expect(coolers.length).toBeGreaterThanOrEqual(signs.length)
    expect(signs.every((sign) => sign.name.trim().length > 0)).toBe(true)
    expect(effigies.length).toBeGreaterThanOrEqual(5)
    expect(temples).toHaveLength(1)
    expect(roadStats.components).toBe(1)
    expect(roadStats.edges).toBeGreaterThanOrEqual(roadStats.nodes)
  })

  it("emits roofed tent structures, keeps the travel corridor open, and places the effigy more centrally than the temple", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const floors = entities.filter((entity) => entity._tag === "floor")
    const roads = entities.filter((entity) => entity._tag === "tunnel")
    const roofs = entities.filter((entity) => entity._tag === "tent")
    const walls = entities.filter((entity) => entity._tag === "wall")
    const tentWalls = entities.filter((entity) =>
      entity._tag === "tent-wall"
    )
    const tentPosts = entities.filter((entity) =>
      entity._tag === "tent-post"
    )
    const structureBlockers: ReadonlyArray<Entity> = [
      ...tentWalls,
      ...tentPosts
    ]
    const effigies = entities.filter((entity) => entity._tag === "effigy")
    const temple = entities.find((entity) => entity._tag === "temple")
    const floorKeys = new Set(floors.map(coordinateKey))
    const roadKeys = new Set(roads.map(coordinateKey))
    const wallKeys = new Set(structureBlockers.map(coordinateKey))
    const xs = entities.map((entity) => entity.at.x)
    const ys = entities.map((entity) => entity.at.y)
    const campgroundCenter = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2
    }

    expect(roofs.length).toBeGreaterThanOrEqual(200)
    expect(walls.length).toBeGreaterThan(0)
    expect(tentWalls.length).toBeGreaterThanOrEqual(100)
    expect(tentPosts.length).toBeGreaterThan(0)
    expect(tentWalls.every((wall) => wall.variant !== "none")).toBe(true)
    for (const wall of structureBlockers) {
      expect(roadKeys.has(coordinateKey(wall))).toBe(false)
    }
    for (const roof of roofs) {
      expect(floorKeys.has(coordinateKey(roof))).toBe(true)
      expect(wallKeys.has(coordinateKey(roof))).toBe(false)
      expect(roadKeys.has(coordinateKey(roof))).toBe(false)
    }
    expect(temple).toBeDefined()
    if (temple === undefined) return

    const nonTempleWalls = walls.filter((wall) =>
      Math.abs(wall.at.x - temple.at.x) > 8
      || Math.abs(wall.at.y - temple.at.y) > 6
    )
    const nearestEffigyDistance = Math.min(
      ...effigies.map((effigy) =>
        Math.abs(effigy.at.x - campgroundCenter.x)
        + Math.abs(effigy.at.y - campgroundCenter.y)
      )
    )
    const templeDistance = Math.abs(temple.at.x - campgroundCenter.x)
      + Math.abs(temple.at.y - campgroundCenter.y)
    const corridorKeys = new Set(
      campgroundReservedTravelCorridorCoordinates().map(({ x, y }) =>
        `${x},${y},0`
      )
    )
    const passableTerrainKeys = new Set(
      entities.filter((entity) =>
        entity._tag === "floor" || entity._tag === "tunnel"
      ).map(coordinateKey)
    )
    const corridorBlockerKeys = new Set(
      entities.filter((entity) =>
        entity._tag === "wall"
        || entity._tag === "tent-wall"
        || entity._tag === "tent-post"
        || entity._tag === "tent"
        || entity._tag === "sign"
        || entity._tag === "effigy"
        || entity._tag === "temple"
        || entity._tag === "cooler"
      ).map(coordinateKey)
    )

    expect(nonTempleWalls.length).toBe(0)
    expect(nearestEffigyDistance).toBeLessThan(templeDistance)
    for (const corridorKey of corridorKeys) {
      expect(passableTerrainKeys.has(corridorKey)).toBe(true)
      expect(corridorBlockerKeys.has(corridorKey)).toBe(false)
    }
  })

  it("does not place impassable walls on road tiles across representative seeds", () => {
    for (const seed of [1, 2, 3, 17, 777]) {
      const world = Effect.runSync(CampgroundGenLevel(seed, 0))
      const entities = Array.from(world.pipe(HashMap.values))
      const roadKeys = new Set(
        entities.filter((entity) => entity._tag === "tunnel").map(
          coordinateKey
        )
      )
      const blockerRoadOverlaps = entities.filter((entity) =>
        (
          entity._tag === "wall"
          || entity._tag === "tent-wall"
          || entity._tag === "tent-post"
        ) && roadKeys.has(coordinateKey(entity))
      )

      expect(blockerRoadOverlaps, `seed ${seed}`).toHaveLength(0)
    }
  })

  it("keeps the enlarged walkable campground connected from spawn to camps and temple", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const spawn = campgroundReservedTravelCorridorCoordinates()[0]
    if (spawn === undefined) throw new Error("missing spawn corridor")
    const reachable = reachablePassableCoordinateKeys(
      entities,
      `${spawn.x},${spawn.y},0`
    )
    const originalArea = 120 * 48
    const signs = entities.filter((entity) => entity._tag === "sign")
    const coolers = entities.filter((entity) => entity._tag === "cooler")
    const temple = entities.find((entity) => entity._tag === "temple")

    expect(reachable.size).toBeGreaterThan(originalArea * 9)
    for (const sign of signs) {
      expect(reachable.has(coordinateKey(sign))).toBe(true)
    }
    for (const cooler of coolers) {
      expect(reachable.has(coordinateKey(cooler))).toBe(true)
    }
    expect(temple).toBeDefined()
    if (temple !== undefined) {
      expect(reachable.has(coordinateKey(temple))).toBe(true)
    }
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
    const campBlockerPositions = new Set([
      ...entities.filter((entity) =>
        entity.in === "world"
        && (
          entity._tag === "wall"
          || entity._tag === "tent-wall"
          || entity._tag === "tent-post"
          || entity._tag === "tent"
          || entity._tag === "sign"
          || entity._tag === "effigy"
          || entity._tag === "temple"
          || entity._tag === "cooler"
        )
      ).map(coordinateKey),
      ...campgroundReservedTravelCorridorCoordinates().map(({ x, y }) =>
        `${x},${y},0`
      )
    ])
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

  it("places closed doors deterministically in BSP dungeon wall passages", () => {
    const world = Effect.runSync(BSPGenLevel(4242, 3))
    const repeatWorld = Effect.runSync(BSPGenLevel(4242, 3))
    const doors = Array.from(world.pipe(HashMap.values)).filter(
      (entity) => entity._tag === "door"
    )
    const repeatDoors = Array.from(repeatWorld.pipe(HashMap.values))
      .filter((entity) => entity._tag === "door")

    expect(doors.length).toBeGreaterThan(0)
    expect(repeatDoors).toEqual(doors)
    expect(doors.every((door) => door.open === false)).toBe(true)
    expect(
      doors.every((door) =>
        door.variant === "vertical" || door.variant === "horizontal"
      )
    ).toBe(true)
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
