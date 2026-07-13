import { describe, expect, it } from "@effect/vitest"
import { AnyCreature, AnyItem, conforms } from "@flaghack/domain/schemas"
import { Effect, HashMap } from "effect"
import { readFileSync } from "node:fs"
import {
  campgroundCamps,
  campgroundRoads,
  formatCampgroundAddress
} from "../src/campground.js"
import {
  CAMPGROUND_BORROWED_TOOL_KEY,
  CAMPGROUND_MISSING_FLAG_KEY
} from "../src/campgroundQuestContent.js"
import { deriveCampgroundNpcAssignments } from "../src/campgroundState.js"
import {
  BSPGenLevel,
  CampgroundGenLevel,
  campgroundMudPuddleCoordinates,
  campgroundReservedTravelCorridorCoordinates,
  campgroundWakeUpCoordinate,
  type Entity,
  isCampgroundShelterPosition,
  isCreature,
  isImpassable,
  isItem,
  isPassableTerrain,
  isTerrain,
  itemsAt,
  makeBspLevel,
  tentStructureTiles,
  tentWallVariant,
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
  "mud",
  "tunnel",
  "tent",
  "sign",
  "effigy",
  "temple",
  "stairs-down",
  "stairs-up"
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
  "water",
  "beer",
  ...refrigeratedCampFoodTags
])
type CampDefinition = typeof campgroundCamps[number]
type DoorEntity = Extract<Entity, { readonly _tag: "door" }>
type SignEntity = Extract<Entity, { readonly _tag: "sign" }>
type TentWallEntity = Extract<Entity, { readonly _tag: "tent-wall" }>

const campDefinitionBySignName: ReadonlyMap<string, CampDefinition> =
  new Map(
    campgroundCamps.map((camp) =>
      [
        `${camp.name} — ${formatCampgroundAddress(camp.address)}`,
        camp
      ] as const
    )
  )
const isCampDefinitionSign = (entity: Entity): entity is SignEntity =>
  entity._tag === "sign" && campDefinitionBySignName.has(entity.name)
const isTentDoor = (entity: Entity): entity is DoorEntity =>
  entity._tag === "door" && entity.kind === "tent"
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

  it("classifies stairways as passable terrain", () => {
    for (const tag of ["stairs-down", "stairs-up"] as const) {
      const entrance = {
        _tag: tag,
        at: { x: 1, y: 0, z: tag === "stairs-down" ? 0 : 1 },
        in: "world",
        key: `${tag}-1`
      } satisfies Entity

      expect(isTerrain(entrance)).toBe(true)
      expect(isImpassable(entrance)).toBe(false)
      expect(isPassableTerrain(entrance)).toBe(true)
    }
  })

  it("classifies mud as passable non-item terrain", () => {
    const mud = {
      _tag: "mud",
      at: { x: 1, y: 0, z: 0 },
      in: "world",
      key: "mud-1"
    } satisfies Entity

    expect(isTerrain(mud)).toBe(true)
    expect(isImpassable(mud)).toBe(false)
    expect(isPassableTerrain(mud)).toBe(true)
    expect(isItem(mud)).toBe(false)
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

describe("personal tent geometry", () => {
  it("keeps every door and wall segment connected to the local boundary", () => {
    for (const interiorSpaces of [1, 2] as const) {
      for (const doorSide of ["north", "south", "west", "east"] as const) {
        const orientation = doorSide === "north" || doorSide === "south"
          ? "horizontal"
          : "vertical"
        const tiles = tentStructureTiles({
          doorSide,
          interiorSpaces,
          kind: "personal",
          orientation,
          origin: { x: 10, y: 20 }
        })
        const boundary = tiles.wallCoordinates.concat(
          tiles.doorCoordinates
        )
        const xs = boundary.map(({ x }) => x)
        const ys = boundary.map(({ y }) => y)
        const left = Math.min(...xs)
        const right = Math.max(...xs)
        const top = Math.min(...ys)
        const bottom = Math.max(...ys)
        const expectedVariant = ({ x, y }: { x: number; y: number }) =>
          x === left && y === top
            ? "topLeft" as const
            : x === right && y === top
            ? "topRight" as const
            : x === left && y === bottom
            ? "bottomLeft" as const
            : x === right && y === bottom
            ? "bottomRight" as const
            : y === top || y === bottom
            ? "horizontal" as const
            : "vertical" as const

        expect(tiles.doorCoordinates).toHaveLength(1)
        expect(boundary).toHaveLength(tiles.wallCoordinates.length + 1)
        for (const coordinate of boundary) {
          expect(tentWallVariant(boundary, coordinate)).toBe(
            expectedVariant(coordinate)
          )
        }

        const door = tiles.doorCoordinates[0]
        expect(door).toBeDefined()
        if (door === undefined) continue
        expect(tentWallVariant(boundary, door)).toBe(
          doorSide === "north" || doorSide === "south"
            ? "horizontal"
            : "vertical"
        )
        expect(
          tiles.wallCoordinates.some(({ x, y }) =>
            x === door.x && y === door.y
          )
        ).toBe(false)
      }
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
    const campSigns = signs.filter(isCampDefinitionSign)
    const coolers = entities.filter((entity) => entity._tag === "cooler")
    const effigies = entities.filter((entity) => entity._tag === "effigy")
    const temples = entities.filter((entity) => entity._tag === "temple")
    const downStairs = entities.filter((entity) =>
      entity._tag === "stairs-down"
    )
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
    expect(signs.length).toBeGreaterThanOrEqual(26)
    expect(campSigns).toHaveLength(campgroundCamps.length)
    expect(new Set(campSigns.map(({ name }) => name))).toEqual(
      new Set(campDefinitionBySignName.keys())
    )
    expect(coolers).toHaveLength(campgroundCamps.length)
    expect(signs.every((sign) => sign.name.trim().length > 0)).toBe(true)
    expect(effigies.length).toBeGreaterThanOrEqual(5)
    expect(temples).toHaveLength(1)
    expect(downStairs).toHaveLength(1)
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
    const tentDoors = entities.filter(isTentDoor)
    const structureBlockers: ReadonlyArray<Entity> = [
      ...tentWalls,
      ...tentDoors,
      ...tentPosts
    ]
    const effigies = entities.filter((entity) => entity._tag === "effigy")
    const temple = entities.find((entity) => entity._tag === "temple")
    const stairsDown = entities.find((entity) =>
      entity._tag === "stairs-down"
    )
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
    expect(tentDoors).toHaveLength(
      campgroundCamps.reduce(
        (count, camp) => count + camp.structure.personalTents,
        0
      )
    )
    expect(
      tentWalls.every((wall) =>
        [
          "vertical",
          "horizontal",
          "bottomLeft",
          "bottomRight",
          "topLeft",
          "topRight"
        ].includes(wall.variant)
      )
    ).toBe(true)
    expect(tentDoors.every((door) => door.open === false)).toBe(true)
    expect(
      tentDoors.every((door) =>
        door.variant === "horizontal" || door.variant === "vertical"
      )
    ).toBe(true)
    for (const wall of structureBlockers) {
      expect(roadKeys.has(coordinateKey(wall))).toBe(false)
    }
    for (const door of tentDoors) {
      expect(floorKeys.has(coordinateKey(door))).toBe(true)
    }
    for (const roof of roofs) {
      expect(
        floorKeys.has(coordinateKey(roof))
          || roadKeys.has(coordinateKey(roof))
      ).toBe(true)
      expect(wallKeys.has(coordinateKey(roof))).toBe(false)
    }
    expect(temple).toBeDefined()
    expect(stairsDown).toBeDefined()
    if (temple === undefined || stairsDown === undefined) return

    const templeLeft = Math.min(...walls.map((wall) => wall.at.x))
    const templeRight = Math.max(...walls.map((wall) => wall.at.x))
    const templeTop = Math.min(...walls.map((wall) => wall.at.y))
    const templeBottom = Math.max(...walls.map((wall) => wall.at.y))
    const entranceOccupants = entities.filter((entity) =>
      samePosition(entity, stairsDown)
    )

    expect(stairsDown.at.x).toBeGreaterThan(templeLeft)
    expect(stairsDown.at.x).toBeLessThan(templeRight)
    expect(stairsDown.at.y).toBeGreaterThan(templeTop)
    expect(stairsDown.at.y).toBeLessThan(templeBottom)
    expect(stairsDown.at.z).toBe(temple.at.z)
    expect(samePosition(stairsDown, temple)).toBe(false)
    expect(entranceOccupants).toEqual([stairsDown])
    expect(isPassableTerrain(stairsDown)).toBe(true)

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
        || (entity._tag === "door" && !entity.open)
        || entity._tag === "tent-wall"
        || entity._tag === "tent-post"
        || entity._tag === "tent"
        || entity._tag === "sign"
        || entity._tag === "effigy"
        || entity._tag === "temple"
        || entity._tag === "stairs-down"
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

  it("places every personal tent door away from roads and other structure terrain across representative seeds", () => {
    const expectedDoorCount = campgroundCamps.reduce(
      (count, camp) => count + camp.structure.personalTents,
      0
    )

    for (const seed of [1, 2, 3, 17, 777]) {
      const world = Effect.runSync(CampgroundGenLevel(seed, 0))
      const entities = Array.from(world.pipe(HashMap.values))
      const roadKeys = new Set(
        entities.filter((entity) => entity._tag === "tunnel").map(
          coordinateKey
        )
      )
      const floors = new Set(
        entities.filter((entity) => entity._tag === "floor").map(
          coordinateKey
        )
      )
      const roofs = new Set(
        entities.filter((entity) => entity._tag === "tent").map(
          coordinateKey
        )
      )
      const tentWallEntities = entities.filter(
        (entity): entity is TentWallEntity => entity._tag === "tent-wall"
      )
      const tentWalls = new Set(tentWallEntities.map(coordinateKey))
      const tentWallByCoordinate = new Map(
        tentWallEntities.map((wall) => [coordinateKey(wall), wall])
      )
      const tentPosts = new Set(
        entities.filter((entity) => entity._tag === "tent-post").map(
          coordinateKey
        )
      )
      const tentDoors = entities.filter(isTentDoor)
      const tentDoorKeys = new Set(tentDoors.map(coordinateKey))
      const entitiesByCoordinate = new Map<string, Array<Entity>>()
      for (const entity of entities) {
        const key = coordinateKey(entity)
        const occupants = entitiesByCoordinate.get(key)
        if (occupants === undefined) {
          entitiesByCoordinate.set(key, [entity])
        } else {
          occupants.push(entity)
        }
      }
      const blockerRoadOverlaps = entities.filter((entity) =>
        (
          entity._tag === "wall"
          || (entity._tag === "door" && !entity.open)
          || entity._tag === "tent-wall"
          || entity._tag === "tent-post"
        ) && roadKeys.has(coordinateKey(entity))
      )

      expect(blockerRoadOverlaps, `seed ${seed}`).toHaveLength(0)
      expect(tentDoors, `seed ${seed}`).toHaveLength(expectedDoorCount)
      expect(
        new Set(tentDoors.map(coordinateKey)).size,
        `seed ${seed}`
      ).toBe(expectedDoorCount)
      for (const door of tentDoors) {
        const key = coordinateKey(door)
        expect(floors.has(key), `floor under ${door.key}, seed ${seed}`)
          .toBe(true)
        expect(roofs.has(key), `roof over ${door.key}, seed ${seed}`)
          .toBe(false)
        expect(tentWalls.has(key), `wall at ${door.key}, seed ${seed}`)
          .toBe(false)
        expect(tentPosts.has(key), `post at ${door.key}, seed ${seed}`)
          .toBe(false)

        const perpendicularDirections = door.variant === "horizontal"
          ? [{ x: 0, y: -1 }, { x: 0, y: 1 }]
          : [{ x: -1, y: 0 }, { x: 1, y: 0 }]
        const interiorCandidates = perpendicularDirections.map(
          ({ x, y }) => ({ x: door.at.x + x, y: door.at.y + y })
        ).filter(({ x, y }) => roofs.has(`${x},${y},${door.at.z}`))

        expect(
          interiorCandidates,
          `interior beside ${door.key}, seed ${seed}`
        ).toHaveLength(1)
        const interior = interiorCandidates[0]
        if (interior === undefined) continue

        const lineDirection = door.variant === "horizontal"
          ? { x: 1, y: 0 }
          : { x: 0, y: 1 }
        let firstRoof = interior
        let lastRoof = interior
        while (
          roofs.has(
            `${firstRoof.x - lineDirection.x},${
              firstRoof.y - lineDirection.y
            },${door.at.z}`
          )
        ) {
          firstRoof = {
            x: firstRoof.x - lineDirection.x,
            y: firstRoof.y - lineDirection.y
          }
        }
        while (
          roofs.has(
            `${lastRoof.x + lineDirection.x},${
              lastRoof.y + lineDirection.y
            },${door.at.z}`
          )
        ) {
          lastRoof = {
            x: lastRoof.x + lineDirection.x,
            y: lastRoof.y + lineDirection.y
          }
        }

        const left = Math.min(firstRoof.x, lastRoof.x) - 1
        const right = Math.max(firstRoof.x, lastRoof.x) + 1
        const top = Math.min(firstRoof.y, lastRoof.y) - 1
        const bottom = Math.max(firstRoof.y, lastRoof.y) + 1
        const boundary = Array.from(
          { length: right - left + 1 },
          (_, index) => ({ x: left + index, y: top })
        ).concat(
          Array.from(
            { length: right - left + 1 },
            (_, index) => ({ x: left + index, y: bottom })
          ),
          Array.from(
            { length: Math.max(0, bottom - top - 1) },
            (_, index) => ({ x: left, y: top + index + 1 })
          ),
          Array.from(
            { length: Math.max(0, bottom - top - 1) },
            (_, index) => ({ x: right, y: top + index + 1 })
          )
        )
        const boundaryDoorKeys = boundary.filter(({ x, y }) =>
          tentDoorKeys.has(`${x},${y},${door.at.z}`)
        )
        expect(
          boundaryDoorKeys,
          `boundary door count for ${door.key}, seed ${seed}`
        ).toHaveLength(1)

        for (const coordinate of boundary) {
          const coordinateKey =
            `${coordinate.x},${coordinate.y},${door.at.z}`
          if (coordinateKey === key) {
            expect(door.variant).toBe(
              tentWallVariant(boundary, coordinate)
            )
            continue
          }

          const wall = tentWallByCoordinate.get(coordinateKey)
          expect(
            wall,
            `wall at ${coordinateKey} for ${door.key}, seed ${seed}`
          ).toBeDefined()
          if (wall !== undefined) {
            expect(wall.variant).toBe(
              tentWallVariant(boundary, coordinate)
            )
          }
        }

        const approach = {
          x: door.at.x + door.at.x - interior.x,
          y: door.at.y + door.at.y - interior.y
        }
        const approachKey = `${approach.x},${approach.y},${door.at.z}`
        const approachOccupants = entitiesByCoordinate.get(approachKey)
          ?? []
        expect(
          approachOccupants.some((entity) =>
            isImpassable(entity) || isCreature(entity)
          ),
          `blocked approach for ${door.key}, seed ${seed}`
        ).toBe(false)
        expect(
          approachOccupants.some(isPassableTerrain),
          `terrain at approach for ${door.key}, seed ${seed}`
        ).toBe(true)
      }
    }
  })

  it("places stable addressed camps across outer, middle, and inner roads with explicit entrances", () => {
    for (const seed of [1, 17, 777]) {
      const entities = Array.from(
        Effect.runSync(CampgroundGenLevel(seed, 0)).pipe(HashMap.values)
      )
      const roads = entities.filter((entity) => entity._tag === "tunnel")
      const campSigns = entities.filter(isCampDefinitionSign)
      const distanceFromEdge = (entity: Entity): number =>
        Math.min(
          entity.at.x,
          359 - entity.at.x,
          entity.at.y,
          159 - entity.at.y
        )
      const outer = campSigns.filter((marker) =>
        distanceFromEdge(marker) <= 5
      )
      const inner = campSigns.filter((marker) =>
        marker.at.x > 100
        && marker.at.x < 260
        && marker.at.y > 40
        && marker.at.y < 120
      )
      const middle = campSigns.filter((marker) =>
        !outer.includes(marker) && !inner.includes(marker)
      )

      expect(campSigns, `seed ${seed}`).toHaveLength(24)
      expect(outer, `seed ${seed}`).toHaveLength(10)
      expect(middle, `seed ${seed}`).toHaveLength(8)
      expect(inner, `seed ${seed}`).toHaveLength(6)
      for (const marker of campSigns) {
        const nearestRoadDistance = Math.min(
          ...roads.map((road) => manhattanDistance(marker, road))
        )
        expect(nearestRoadDistance, marker.name).toBeLessThanOrEqual(1)
      }
    }
  })

  it("gives the arrival viewport civic props and the landmark spine readable breadcrumbs", () => {
    const entities = Array.from(
      Effect.runSync(CampgroundGenLevel(777, 0)).pipe(HashMap.values)
    )
    const roads = entities.filter((entity) => entity._tag === "tunnel")
    const roadKeys = new Set(roads.map(coordinateKey))
    const props = entities.filter((entity) => entity._tag === "camp-prop")
    const propsInInitialViewport = props.filter((prop) =>
      Math.abs(prop.at.x - 96) <= 39
      && Math.abs(prop.at.y - 120) <= 10
    )
    const propKinds = new Set(props.map(({ kind }) => kind))
    const roadProps = props.filter((prop) =>
      roadKeys.has(coordinateKey(prop))
    )
    const propPositions = new Set(props.map(coordinateKey))

    expect(propPositions.size).toBe(props.length)
    expect(
      propsInInitialViewport.some(({ kind }) => kind === "arrival-gate")
    ).toBe(true)
    expect(propsInInitialViewport.some(({ kind }) => kind === "directory"))
      .toBe(true)
    expect(
      propsInInitialViewport.some(({ kind }) => kind === "water-station")
    ).toBe(true)
    expect(props.filter(({ kind }) => kind === "lantern").length)
      .toBeGreaterThanOrEqual(4)
    expect(propKinds).toEqual(
      new Set([
        "arrival-gate",
        "artwork",
        "flagpole",
        "stage",
        "workbench",
        "bike-rack",
        "directory",
        "water-station",
        "speaker",
        "lantern",
        "table"
      ])
    )
    expect(roadProps.every(({ kind }) => kind === "arrival-gate")).toBe(
      true
    )
    expect(
      entities.filter((entity) =>
        entity._tag === "water" && entity.in === "world"
      )
    ).toHaveLength(4)
    expect(entities.some((entity) =>
      entity._tag === "ranger"
      && Math.abs(entity.at.x - 100) + Math.abs(entity.at.y - 117) <= 4
    )).toBe(true)
  })

  it("places every named district road sign on its real road graph", () => {
    const entities = Array.from(
      Effect.runSync(CampgroundGenLevel(777, 0)).pipe(HashMap.values)
    )
    const roadPositions = new Set(
      entities.filter(({ _tag }) => _tag === "tunnel").map(coordinateKey)
    )

    for (const road of campgroundRoads) {
      const signs = entities.filter((entity) =>
        entity._tag === "sign" && entity.name === road.signLabel
      )
      expect(signs).toHaveLength(1)
      expect(
        signs[0] === undefined
          ? false
          : roadPositions.has(coordinateKey(signs[0]))
      ).toBe(true)
    }
  })

  it("keeps the enlarged walkable campground connected from spawn to camps, temple, and stairs down", () => {
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
    const stairsDown = entities.find((entity) =>
      entity._tag === "stairs-down"
    )

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
    expect(stairsDown).toBeDefined()
    if (stairsDown !== undefined) {
      expect(reachable.has(coordinateKey(stairsDown))).toBe(true)
    }
  })

  it("fills each camp cooler from its stable loot profile", () => {
    const world = Effect.runSync(CampgroundGenLevel(777, 0))
    const entities = Array.from(world.pipe(HashMap.values))
    const coolers = entities.filter((entity) => entity._tag === "cooler")
    const campSigns = entities.filter(isCampDefinitionSign)
    const matchedCoolers = new Set<string>()

    expect(coolers).toHaveLength(campgroundCamps.length)
    expect(coolers.every((cooler) => cooler.in === "world")).toBe(true)

    for (const marker of campSigns) {
      const definition = campDefinitionBySignName.get(marker.name)
      if (definition === undefined) {
        throw new Error(`missing camp definition for ${marker.name}`)
      }
      const cooler = coolers
        .filter((candidate) => !matchedCoolers.has(candidate.key))
        .sort((a, b) =>
          manhattanDistance(a, marker) - manhattanDistance(b, marker)
        )[0]
      if (cooler === undefined) {
        throw new Error(`missing cooler for ${marker.name}`)
      }
      matchedCoolers.add(cooler.key)
      const terrainAtCooler = entities.find((entity) =>
        entity.in === "world"
        && entity._tag === "floor"
        && samePosition(entity, cooler)
      )
      const contents = entities.filter((entity) =>
        entity.in === cooler.key
      )
      const profileContents = contents.filter(({ _tag }) =>
        coolerContentTags.has(_tag)
      )
      const actualProfile = {
        beer: profileContents.filter(({ _tag }) => _tag === "beer").length,
        cheese: profileContents.filter(({ _tag }) => _tag === "cheese")
          .length,
        hotdog: profileContents.filter(({ _tag }) => _tag === "hotdog")
          .length,
        salsa: profileContents.filter(({ _tag }) => _tag === "salsa")
          .length,
        water: profileContents.filter(({ _tag }) => _tag === "water")
          .length
      }
      const groundItemsAtCooler = Array.from(
        itemsAt(world)(cooler.at).pipe(HashMap.values)
      ).filter((item) => item.key !== cooler.key)

      expect(terrainAtCooler).toBeDefined()
      expect(manhattanDistance(cooler, marker)).toBeLessThanOrEqual(3)
      expect(actualProfile).toEqual(definition.coolerLoot)
      expect(
        profileContents.every((entity) =>
          coolerContentTags.has(entity._tag)
        )
      )
        .toBe(true)
      expect(contents.every((entity) => entity.in === cooler.key)).toBe(
        true
      )
      expect(groundItemsAtCooler).toHaveLength(0)
      const borrowedTools = contents.filter(({ key }) =>
        key === CAMPGROUND_BORROWED_TOOL_KEY
      )
      expect(borrowedTools).toHaveLength(
        definition.id === "patch-bay" ? 1 : 0
      )
      if (borrowedTools[0] !== undefined) {
        expect(borrowedTools[0]._tag).toBe("hammer")
      }
    }
    expect(matchedCoolers.size).toBe(coolers.length)
  })

  it("spawns mostly hippies plus named humans on passable camp terrain", () => {
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
    const campAndCivicMarkers = entities.filter((entity) =>
      isCampDefinitionSign(entity)
      || entity._tag === "effigy"
      || entity._tag === "temple"
      || (entity._tag === "camp-prop"
        && (
          entity.kind === "arrival-gate"
          || entity.kind === "directory"
          || entity.kind === "water-station"
        ))
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
          || entity._tag === "sign"
          || entity._tag === "effigy"
          || entity._tag === "temple"
          || entity._tag === "stairs-down"
          || entity._tag === "cooler"
          || entity._tag === "camp-prop"
        )
      ).map(coordinateKey),
      ...campgroundReservedTravelCorridorCoordinates().map(({ x, y }) =>
        `${x},${y},0`
      )
    ])
    const npcPositions = new Set(campgroundNpcs.map(coordinateKey))
    const shelteredNpcCount =
      campgroundNpcs.filter((npc) =>
        isCampgroundShelterPosition(world, npc.at)
      ).length

    const schemaIsCreature = conforms(AnyCreature)

    const nearbyNpcCount =
      campgroundNpcs.filter((npc) =>
        campAndCivicMarkers.some((marker) =>
          manhattanDistance(npc, marker) <= 12
        )
      ).length
    const openPlayaNpcCount =
      campgroundNpcs.filter((npc) =>
        entities.some((entity) =>
          entity._tag === "floor" && samePosition(entity, npc)
        )
        && campAndCivicMarkers.every((marker) =>
          manhattanDistance(npc, marker) > 14
        )
      ).length

    expect(campgroundNpcs).toHaveLength(80)
    expect(hippies).toHaveLength(64)
    expect(namedHumans).toHaveLength(16)
    expect(nearbyNpcCount).toBeGreaterThanOrEqual(
      campgroundNpcs.length * 0.6
    )
    expect(openPlayaNpcCount).toBeGreaterThan(0)
    expect(npcPositions.size).toBe(campgroundNpcs.length)
    expect(shelteredNpcCount).toBeGreaterThanOrEqual(72)

    for (const npc of campgroundNpcs) {
      expect(npc.in).toBe("world")
      if (!schemaIsCreature(npc)) {
        throw new Error(`${npc.key} did not conform to AnyCreature`)
      }
      expect(npc.attributes).toBeDefined()
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
        "attributes",
        "in",
        "key",
        "name"
      ])
    }
  })

  it("wakes the player in deterministic mud and shelters camp residents across representative seeds", () => {
    const flagshipIds = campgroundCamps.filter(({ kind }) =>
      kind === "flagship"
    ).map(({ id }) => id).sort()
    const wakeKey =
      `${campgroundWakeUpCoordinate.x},${campgroundWakeUpCoordinate.y},0`
    const expectedPuddleKeys = new Set(
      campgroundMudPuddleCoordinates().map(({ x, y }) => `${x},${y},0`)
    )

    expect(expectedPuddleKeys.size).toBeGreaterThanOrEqual(7)
    for (const seed of [1, 17, 777]) {
      const world = Effect.runSync(CampgroundGenLevel(seed, 0))
      const entities = Array.from(world.pipe(HashMap.values))
      const roads = entities.filter(({ _tag }) => _tag === "tunnel")
      const roadKeys = new Set(roads.map(coordinateKey))
      const mudTiles = entities.filter(({ _tag }) => _tag === "mud")
      const mudKeys = new Set(mudTiles.map(coordinateKey))
      const floors = entities.filter(({ _tag }) => _tag === "floor")
      const gate = entities.find((entity) =>
        entity._tag === "camp-prop" && entity.kind === "arrival-gate"
      )
      const greeter = entities.find((entity) =>
        entity._tag === "ranger"
        && entity.at.x === 103
        && entity.at.y === 117
        && entity.at.z === 0
      )
      const campgroundNpcs = entities.filter((entity) =>
        entity.in === "world"
        && (entity._tag === "hippie" || entity._tag === "ranger")
      )
      const hippies = campgroundNpcs.filter(({ _tag }) =>
        _tag === "hippie"
      )
      const rangers = campgroundNpcs.filter(({ _tag }) =>
        _tag === "ranger"
      )
      const shelteredNpcs = campgroundNpcs.filter((npc) =>
        isCampgroundShelterPosition(world, npc.at)
      )
      const assignments = deriveCampgroundNpcAssignments(world)
      const entityByKey = new Map(entities.map((entity) => [
        entity.key,
        entity
      ]))
      const hosts = assignments.filter(({ role }) => role === "host")
      const civicLandmarkIds = assignments.flatMap((assignment) =>
        assignment.role === "civic"
          && assignment.landmarkId !== undefined
          ? [assignment.landmarkId]
          : []
      )
      const travelerAssignments = assignments.filter(({ role }) =>
        role === "traveler" || role === "patrol"
      )
      const closestSpawnFloor = floors.reduce<Entity | undefined>(
        (closest, candidate) => {
          if (gate === undefined) return closest
          const candidateDistance = manhattanDistance(candidate, gate)
          const closestDistance = closest === undefined
            ? Number.POSITIVE_INFINITY
            : manhattanDistance(closest, gate)
          return candidateDistance < closestDistance ? candidate : closest
        },
        undefined
      )
      const reachable = reachablePassableCoordinateKeys(entities, wakeKey)
      const wakeOccupants = entities.filter((entity) =>
        coordinateKey(entity) === wakeKey
        && entity._tag !== "floor"
        && entity._tag !== "mud"
      )
      const puddleXs = mudTiles.map(({ at }) => at.x)
      const puddleYs = mudTiles.map(({ at }) => at.y)
      const puddleBoundingArea =
        (Math.max(...puddleXs) - Math.min(...puddleXs) + 1)
        * (Math.max(...puddleYs) - Math.min(...puddleYs) + 1)

      expect(mudKeys, `seed ${seed}`).toEqual(expectedPuddleKeys)
      expect(puddleBoundingArea, `seed ${seed}`).toBeGreaterThan(
        mudTiles.length
      )
      expect(mudKeys.has(wakeKey), `seed ${seed}`).toBe(true)
      expect(roadKeys.has(wakeKey), `seed ${seed}`).toBe(false)
      expect(
        closestSpawnFloor === undefined
          ? undefined
          : coordinateKey(closestSpawnFloor),
        `seed ${seed}`
      ).toBe(wakeKey)
      expect(wakeOccupants, `seed ${seed}`).toHaveLength(0)
      expect(gate, `seed ${seed}`).toBeDefined()
      expect(greeter, `seed ${seed}`).toBeDefined()
      if (gate !== undefined) {
        expect(Math.abs(gate.at.x - campgroundWakeUpCoordinate.x))
          .toBeLessThanOrEqual(39)
        expect(Math.abs(gate.at.y - campgroundWakeUpCoordinate.y))
          .toBeLessThanOrEqual(10)
        expect(reachable.has(coordinateKey(gate)), `seed ${seed}`).toBe(
          true
        )
      }
      if (greeter !== undefined) {
        expect(isCampgroundShelterPosition(world, greeter.at)).toBe(true)
      }
      expect(
        entities.filter(({ in: containerKey }) =>
          containerKey === "player"
        ),
        `seed ${seed}`
      ).toHaveLength(0)
      expect(campgroundNpcs, `seed ${seed}`).toHaveLength(80)
      expect(hippies, `seed ${seed}`).toHaveLength(64)
      expect(rangers, `seed ${seed}`).toHaveLength(16)
      expect(new Set(campgroundNpcs.map(coordinateKey)).size).toBe(80)
      expect(shelteredNpcs.length, `seed ${seed}`).toBe(75)
      expect(assignments, `seed ${seed}`).toHaveLength(80)
      expect(new Set(assignments.map(({ npcKey }) => npcKey)).size).toBe(
        80
      )
      expect(hosts.map(({ campId }) => campId).sort(), `seed ${seed}`)
        .toEqual(flagshipIds)
      expect(new Set(civicLandmarkIds), `seed ${seed}`).toEqual(
        new Set(["arrival-plaza", "central-effigy", "temple"])
      )
      for (const assignment of travelerAssignments) {
        const npc = entityByKey.get(assignment.npcKey)
        expect(npc, `seed ${seed} ${assignment.npcKey}`).toBeDefined()
        if (npc === undefined) continue
        const legalRoadPosition = roadKeys.has(coordinateKey(npc))
          || cardinalRoadNeighborKeys(npc).some((key) => roadKeys.has(key))
        expect(legalRoadPosition, `seed ${seed} ${assignment.npcKey}`)
          .toBe(true)
      }
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

  it("generates the first dungeon as connected roomless corridors with a few tunnel hippies", () => {
    for (const seed of [1, 17, 777]) {
      const world = Effect.runSync(BSPGenLevel(seed, 1))
      const entities = Array.from(world.pipe(HashMap.values))
      const tunnels = entities.filter((entity) => entity._tag === "tunnel")
      const walls = entities.filter((entity) => entity._tag === "wall")
      const floors = entities.filter((entity) => entity._tag === "floor")
      const doors = entities.filter((entity) => entity._tag === "door")
      const hippies = entities.filter((entity) => entity._tag === "hippie")
      const upStairs = entities.filter((entity) =>
        entity._tag === "stairs-up"
      )
      const missingFlags = entities.filter(({ key }) =>
        key === CAMPGROUND_MISSING_FLAG_KEY
      )
      const tunnelKeys = new Set(tunnels.map(coordinateKey))
      const hippieKeys = new Set(hippies.map(coordinateKey))
      const schemaIsCreature = conforms(AnyCreature)
      const openTunnelSquares = tunnels.filter((tunnel) =>
        tunnelKeys.has(
          `${tunnel.at.x + 1},${tunnel.at.y},${tunnel.at.z}`
        )
        && tunnelKeys.has(
          `${tunnel.at.x},${tunnel.at.y + 1},${tunnel.at.z}`
        )
        && tunnelKeys.has(
          `${tunnel.at.x + 1},${tunnel.at.y + 1},${tunnel.at.z}`
        )
      )

      expect(new Set(entities.map((entity) => entity._tag))).toEqual(
        new Set(["wall", "tunnel", "hippie", "stairs-up", "flag"])
      )
      expect(entities.every((entity) => entity.at.z === 1)).toBe(true)
      expect(tunnels.length).toBeGreaterThan(0)
      expect(walls.length).toBeGreaterThan(0)
      expect(walls.some((wall) => wall.variant !== "none")).toBe(true)
      expect(floors).toHaveLength(0)
      expect(doors).toHaveLength(0)
      expect(roadGraphStats(tunnels).components).toBe(1)
      expect(openTunnelSquares).toHaveLength(0)
      expect(hippies).toHaveLength(3)
      expect(upStairs).toHaveLength(1)
      expect(missingFlags).toHaveLength(1)
      const missingFlag = missingFlags[0]
      expect(missingFlag?._tag).toBe("flag")
      expect(missingFlag?.in).toBe("world")
      expect(
        missingFlag === undefined ? false : tunnelKeys.has(
          coordinateKey(missingFlag)
        )
      ).toBe(true)
      expect(
        missingFlag === undefined
          ? -1
          : cardinalRoadNeighborKeys(missingFlag).filter((key) =>
            tunnelKeys.has(key)
          ).length
      ).toBe(1)
      expect(
        missingFlag === undefined
          ? false
          : hippieKeys.has(coordinateKey(missingFlag))
      ).toBe(false)
      const returnStairs = upStairs[0]
      expect(returnStairs).toBeDefined()
      if (returnStairs === undefined) {
        throw new Error("missing first-dungeon return stairs")
      }
      expect(returnStairs.at).toEqual({ x: 1, y: 1, z: 1 })
      expect(isPassableTerrain(returnStairs)).toBe(true)
      expect(hippieKeys.size).toBe(hippies.length)
      expect(hippieKeys.has("1,1,1")).toBe(false)

      for (const hippie of hippies) {
        expect(hippie.in).toBe("world")
        expect(schemaIsCreature(hippie)).toBe(true)
        expect(hippie.attributes).toBeDefined()
        expect(tunnelKeys.has(coordinateKey(hippie))).toBe(true)
        const tunnelNeighborCount = cardinalRoadNeighborKeys(hippie)
          .filter((key) => tunnelKeys.has(key)).length
        expect(tunnelNeighborCount).toBe(1)
      }
    }
  })

  it("keeps the corridor-only dungeon special case deterministic and scoped to level one", () => {
    const first = Array.from(
      Effect.runSync(BSPGenLevel(777, 1)).pipe(HashMap.values)
    ).sort((a, b) => a.key.localeCompare(b.key))
    const repeat = Array.from(
      Effect.runSync(BSPGenLevel(777, 1)).pipe(HashMap.values)
    ).sort((a, b) => a.key.localeCompare(b.key))
    const deeper = Array.from(
      Effect.runSync(BSPGenLevel(777, 2)).pipe(HashMap.values)
    )

    expect(repeat).toEqual(first)
    expect(deeper.some((entity) => entity._tag === "floor")).toBe(true)
    expect(deeper.some((entity) => entity._tag === "hippie")).toBe(
      false
    )
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
