import { describe, expect, it } from "@effect/vitest"
import { HashMap } from "effect"
import {
  campgroundCamps,
  campgroundLandmarks,
  campgroundRoads,
  formatCampgroundAddress
} from "../src/campground.js"
import {
  campgroundRoadStepShare,
  campPlaceKey,
  currentCampgroundAddress,
  currentCampgroundCamp,
  discoverCampgroundCamps,
  discoverCampgroundLandmarks,
  discoverCampgroundPlaces,
  filterDiscoveredCampgroundPlaces,
  filterHiddenCampgroundPlaces,
  filterUndiscoveredCampgroundPlaces,
  isLegalCampgroundStep,
  landmarkPlaceKey,
  nearestCampgroundAddress,
  nearestCampgroundCamp,
  nextRoadWeightedCampgroundStep,
  roadWeightedCampgroundPath,
  routeToCampgroundPlace
} from "../src/campgroundNavigation.js"
import { makeHippie } from "../src/creatures.js"
import type { Entity, World } from "../src/world.js"

const worldOf = (entities: ReadonlyArray<Entity>): World =>
  HashMap.fromIterable(entities.map((entity) => [entity.key, entity]))

const floorAt = (key: string, x: number, y: number, z = 0): Entity => ({
  _tag: "floor",
  at: { x, y, z },
  in: "world",
  key
})

const mudAt = (key: string, x: number, y: number, z = 0): Entity => ({
  _tag: "mud",
  at: { x, y, z },
  in: "world",
  key
})

const tunnelAt = (key: string, x: number, y: number, z = 0): Entity => ({
  _tag: "tunnel",
  at: { x, y, z },
  in: "world",
  key
})

const signAt = (
  key: string,
  x: number,
  y: number,
  name: string,
  z = 0
): Entity => ({
  _tag: "sign",
  at: { x, y, z },
  in: "world",
  key,
  name
})

const effigyAt = (key: string, x: number, y: number): Entity => ({
  _tag: "effigy",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const templeAt = (key: string, x: number, y: number): Entity => ({
  _tag: "temple",
  at: { x, y, z: 0 },
  in: "world",
  key
})

const campPropAt = (
  key: string,
  x: number,
  y: number,
  kind: "arrival-gate" | "directory" | "water-station"
): Entity => ({
  _tag: "camp-prop",
  at: { x, y, z: 0 },
  in: "world",
  key,
  kind
})

const wallAt = (key: string, x: number, y: number): Entity => ({
  _tag: "wall",
  at: { x, y, z: 0 },
  in: "world",
  key,
  variant: "none"
})

const floorRectangle = (
  width: number,
  height: number
): ReadonlyArray<Entity> =>
  Array.from(
    { length: height },
    (_, y) =>
      Array.from({ length: width }, (_, x) =>
        floorAt(`floor-${x}-${y}`, x, y))
  ).flat()

describe("campground navigation discovery", () => {
  it("derives camp and landmark records only from actual generated entities", () => {
    const firstCamp = campgroundCamps[0]
    const secondCamp = campgroundCamps[1]
    if (firstCamp === undefined || secondCamp === undefined) {
      throw new Error("missing catalog fixtures")
    }
    const integratedCampSign = `${firstCamp.name} — ${
      formatCampgroundAddress(firstCamp.address)
    }`
    const world = worldOf([
      signAt("camp-integrated", 3, 4, integratedCampSign),
      signAt("camp-exact", 8, 4, secondCamp.name),
      signAt("unrelated", 9, 4, `${secondCamp.name} Annex`),
      signAt("other-level", 1, 1, campgroundCamps[2]?.name ?? "camp", 1),
      campPropAt("arrival", 0, 4, "arrival-gate"),
      campPropAt("directory", 1, 4, "directory"),
      campPropAt("water", 2, 4, "water-station"),
      effigyAt("effigy-north", 12, 9),
      effigyAt("effigy-center", 12, 10),
      effigyAt("effigy-south", 12, 11),
      templeAt("temple", 18, 5)
    ])

    const camps = discoverCampgroundCamps(world)
    const landmarks = discoverCampgroundLandmarks(world)

    expect(camps.map(({ id }) => id)).toEqual([
      firstCamp.id,
      secondCamp.id
    ])
    expect(camps[0]?.at).toEqual({ x: 3, y: 4, z: 0 })
    expect(camps[0]?.entityKeys).toEqual(["camp-integrated"])
    expect(camps[0]?.addressLabel).toBe(
      formatCampgroundAddress(firstCamp.address)
    )
    expect(landmarks.map(({ id }) => id)).toEqual(
      campgroundLandmarks.map(({ id }) => id)
    )
    expect(
      landmarks.find(({ id }) => id === "central-effigy")?.at
    ).toEqual({ x: 12, y: 10, z: 0 })
    expect(
      landmarks.find(({ id }) => id === "central-effigy")?.entityKeys
    ).toEqual(["effigy-center", "effigy-north", "effigy-south"])
  })

  it("finds the current and nearest real camp address with stable ties", () => {
    const firstCamp = campgroundCamps[0]
    const secondCamp = campgroundCamps[1]
    if (firstCamp === undefined || secondCamp === undefined) {
      throw new Error("missing catalog fixtures")
    }
    const world = worldOf([
      signAt("first", 2, 2, firstCamp.name),
      signAt("second", 8, 2, secondCamp.name)
    ])
    const position = { x: 7, y: 2, z: 0 }

    expect(nearestCampgroundCamp(world, position)).toMatchObject({
      distance: 1,
      record: { id: secondCamp.id }
    })
    expect(currentCampgroundCamp(world, position, 1)).toMatchObject({
      distance: 1,
      record: { id: secondCamp.id }
    })
    expect(currentCampgroundCamp(world, position, 0)).toBeUndefined()
    expect(nearestCampgroundAddress(world, position)).toMatchObject({
      address: secondCamp.address,
      addressLabel: formatCampgroundAddress(secondCamp.address),
      distance: 1
    })
    expect(currentCampgroundAddress(world, position, 1)?.camp.id).toBe(
      secondCamp.id
    )

    const tie = nearestCampgroundCamp(world, { x: 5, y: 2, z: 0 })
    expect(tie?.record.id).toBe(firstCamp.id)
  })

  it("filters hidden, discovered, and undiscovered places in catalog order", () => {
    const firstCamp = campgroundCamps[0]
    const secondCamp = campgroundCamps[1]
    if (firstCamp === undefined || secondCamp === undefined) {
      throw new Error("missing catalog fixtures")
    }
    const world = worldOf([
      signAt("first", 2, 2, firstCamp.name),
      signAt("second", 8, 2, secondCamp.name),
      campPropAt("directory", 1, 2, "directory")
    ])
    const places = [...discoverCampgroundPlaces(world)].reverse()
    const discovered = [
      campPlaceKey(secondCamp.id),
      campPlaceKey(firstCamp.id),
      landmarkPlaceKey("directory")
    ]
    const hidden = [landmarkPlaceKey("directory")]

    expect(
      filterDiscoveredCampgroundPlaces(places, discovered, hidden).map(
        ({ discoveryKey }) => discoveryKey
      )
    ).toEqual([campPlaceKey(firstCamp.id), campPlaceKey(secondCamp.id)])
    expect(
      filterHiddenCampgroundPlaces(places, hidden).map(
        ({ discoveryKey }) => discoveryKey
      )
    ).toEqual([campPlaceKey(firstCamp.id), campPlaceKey(secondCamp.id)])
    expect(
      filterUndiscoveredCampgroundPlaces(
        places,
        [campPlaceKey(firstCamp.id)],
        hidden
      ).map(({ discoveryKey }) => discoveryKey)
    ).toEqual([campPlaceKey(secondCamp.id)])
  })
})

describe("campground road-weighted routing", () => {
  const firstCamp = campgroundCamps[0]
  const firstRoad = campgroundRoads[0]
  if (firstCamp === undefined || firstRoad === undefined) {
    throw new Error("missing catalog fixtures")
  }

  const routeWorld = (
    extraEntities: ReadonlyArray<Entity> = []
  ): World =>
    worldOf([
      ...floorRectangle(7, 3),
      ...Array.from({ length: 7 }, (_, x) => tunnelAt(`road-${x}`, x, 0)),
      signAt("road-sign", 1, 0, firstRoad.signLabel),
      signAt(
        "destination",
        6,
        0,
        `${firstCamp.name} — ${formatCampgroundAddress(firstCamp.address)}`
      ),
      ...extraEntities
    ])

  it("prefers tunnel roads over a shorter open-floor route", () => {
    const world = routeWorld()
    const start = { x: 0, y: 1, z: 0 }
    const destination = { x: 6, y: 0, z: 0 }
    const path = roadWeightedCampgroundPath(world, start, destination)

    expect(path?.at(0)).toEqual(start)
    expect(path?.at(-1)).toEqual(destination)
    expect(nextRoadWeightedCampgroundStep(world, start, destination))
      .toEqual(
        { x: 1, y: 0, z: 0 }
      )
    expect(path?.slice(1).every(({ y }) => y === 0)).toBe(true)
    expect(campgroundRoadStepShare(world, path)).toBe(1)
    expect(
      path?.slice(1).every((step, index) =>
        isLegalCampgroundStep(world, path[index] ?? start, step)
      )
    ).toBe(true)
  })

  it("routes around authoritative terrain and creature blockers", () => {
    const world = routeWorld([
      wallAt("road-wall", 3, 0),
      makeHippie("road-hippie", 4, 0, 0)
    ])
    const path = roadWeightedCampgroundPath(
      world,
      { x: 0, y: 1, z: 0 },
      { x: 6, y: 0, z: 0 }
    )

    expect(path).toBeDefined()
    expect(path).not.toContainEqual({ x: 3, y: 0, z: 0 })
    expect(path).not.toContainEqual({ x: 4, y: 0, z: 0 })

    const sealedWorld = worldOf([
      ...floorRectangle(3, 3),
      wallAt("wall-0", 1, 0),
      wallAt("wall-1", 1, 1),
      wallAt("wall-2", 1, 2)
    ])
    expect(roadWeightedCampgroundPath(
      sealedWorld,
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 }
    )).toBeUndefined()
  })

  it("does not cut diagonally between blocked orthogonal cells", () => {
    const world = worldOf([
      ...floorRectangle(2, 2),
      wallAt("north-blocker", 1, 0),
      wallAt("west-blocker", 0, 1)
    ])
    const start = { x: 0, y: 0, z: 0 }
    const destination = { x: 1, y: 1, z: 0 }

    expect(isLegalCampgroundStep(world, start, destination)).toBe(false)
    expect(roadWeightedCampgroundPath(world, start, destination))
      .toBeUndefined()
  })

  it("treats roadside mud as legal passable campground terrain", () => {
    const world = worldOf([
      floorAt("start", 0, 0),
      mudAt("puddle", 1, 0),
      tunnelAt("road", 2, 0)
    ])

    expect(isLegalCampgroundStep(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 }
    )).toBe(true)
    expect(roadWeightedCampgroundPath(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }
    )).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }
    ])
  })

  it("produces a next step and directions naming heading, road, address, and destination", () => {
    const world = routeWorld()
    const destination = discoverCampgroundCamps(world).find(({ id }) =>
      id === firstCamp.id
    )
    if (destination === undefined) throw new Error("missing destination")

    const route = routeToCampgroundPlace(
      world,
      { x: 0, y: 1, z: 0 },
      destination
    )

    expect(route.nextStep).toEqual({ x: 1, y: 0, z: 0 })
    expect(route.directions).toBe(
      `Head northeast, join ${firstRoad.name} toward ${firstCamp.address.marker}, and continue to ${firstCamp.name}.`
    )
  })
})
