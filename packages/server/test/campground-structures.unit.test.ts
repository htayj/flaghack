import { describe, expect, it } from "@effect/vitest"
import { tentStructureTiles, tentWallVariant } from "../src/world.js"

const coordinateKey = (
  coordinate: { readonly x: number; readonly y: number }
): string => `${coordinate.x},${coordinate.y}`

const sortedCoordinateKeys = (
  coordinates: ReadonlyArray<{ readonly x: number; readonly y: number }>
): Array<string> => coordinates.map(coordinateKey).sort()

const coordinateKeySet = (
  coordinates: ReadonlyArray<{ readonly x: number; readonly y: number }>
): Set<string> => new Set(coordinates.map(coordinateKey))

const expectCoordinateKeys = (
  coordinates: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  expectedKeys: ReadonlyArray<string>
) =>
  expect(sortedCoordinateKeys(coordinates)).toEqual(
    [...expectedKeys].sort()
  )

const areCardinallyAdjacent = (
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number }
): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1

describe("tentStructureTiles", () => {
  it("builds personal tents with one or two roofed interior spaces and one passable door gap", () => {
    const oneSpace = tentStructureTiles({
      kind: "personal",
      origin: { x: 10, y: 10 },
      interiorSpaces: 1,
      doorSide: "south"
    })
    const twoSpace = tentStructureTiles({
      kind: "personal",
      origin: { x: 20, y: 20 },
      interiorSpaces: 2,
      orientation: "horizontal",
      doorSide: "south"
    })

    expectCoordinateKeys(oneSpace.roofCoordinates, ["11,11"])
    expectCoordinateKeys(oneSpace.doorCoordinates, ["11,12"])
    expectCoordinateKeys(oneSpace.wallCoordinates, [
      "10,10",
      "11,10",
      "12,10",
      "10,11",
      "12,11",
      "10,12",
      "12,12"
    ])
    expect(coordinateKeySet(oneSpace.floorCoordinates).has("11,12")).toBe(
      true
    )

    expectCoordinateKeys(twoSpace.roofCoordinates, ["21,21", "22,21"])
    expectCoordinateKeys(twoSpace.doorCoordinates, ["21,22"])
    expect(coordinateKeySet(twoSpace.wallCoordinates).has("21,22")).toBe(
      false
    )
    expect(twoSpace.wallCoordinates.length).toBe(9)

    for (const structure of [oneSpace, twoSpace]) {
      const wallKeys = coordinateKeySet(structure.wallCoordinates)
      for (const door of structure.doorCoordinates) {
        expect(wallKeys.has(coordinateKey(door))).toBe(false)
        expect(
          coordinateKeySet(structure.floorCoordinates).has(
            coordinateKey(door)
          )
        )
          .toBe(true)
      }
      for (const wallCoordinate of structure.wallCoordinates) {
        expect(tentWallVariant(structure.wallCoordinates, wallCoordinate))
          .not.toBe("none")
      }
    }
  })

  it("builds carports as roofed tunnels with two opposing wall lines and open opposing sides", () => {
    const carport = tentStructureTiles({
      kind: "carport",
      origin: { x: 5, y: 5 },
      orientation: "horizontal",
      length: 5,
      interiorSpan: 3
    })
    const wallKeys = coordinateKeySet(carport.wallCoordinates)
    const roofKeys = coordinateKeySet(carport.roofCoordinates)

    expect(new Set(carport.roofCoordinates.map(({ x }) => x)).size)
      .toBeGreaterThanOrEqual(3)
    expect(new Set(carport.roofCoordinates.map(({ y }) => y)).size)
      .toBeGreaterThanOrEqual(3)
    expectCoordinateKeys(carport.wallCoordinates, [
      "5,5",
      "6,5",
      "7,5",
      "8,5",
      "9,5",
      "5,9",
      "6,9",
      "7,9",
      "8,9",
      "9,9"
    ])

    for (const y of [6, 7, 8]) {
      expect(wallKeys.has(`5,${y}`)).toBe(false)
      expect(wallKeys.has(`9,${y}`)).toBe(false)
    }
    for (const roofKey of roofKeys) {
      expect(wallKeys.has(roofKey)).toBe(false)
    }
    for (const wallCoordinate of carport.wallCoordinates) {
      expect(tentWallVariant(carport.wallCoordinates, wallCoordinate)).not
        .toBe("none")
    }
  })

  it("builds popups as large roof rectangles with isolated, evenly spaced posts", () => {
    const popup = tentStructureTiles({
      kind: "popup",
      origin: { x: 20, y: 20 },
      width: 8,
      height: 5,
      postSpacing: 3
    })
    const wallKeys = coordinateKeySet(popup.wallCoordinates)
    const roofKeys = coordinateKeySet(popup.roofCoordinates)

    expect(popup.roofCoordinates.length).toBe(8 * 5)
    expect(new Set(popup.roofCoordinates.map(({ x }) => x)).size)
      .toBeGreaterThanOrEqual(4)
    expect(new Set(popup.roofCoordinates.map(({ y }) => y)).size)
      .toBeGreaterThanOrEqual(4)
    expect(wallKeys.has("19,19")).toBe(true)
    expect(wallKeys.has("28,19")).toBe(true)
    expect(wallKeys.has("19,25")).toBe(true)
    expect(wallKeys.has("28,25")).toBe(true)

    for (const roofKey of roofKeys) {
      expect(wallKeys.has(roofKey)).toBe(false)
    }
    for (let left = 0; left < popup.wallCoordinates.length; left += 1) {
      for (
        let right = left + 1;
        right < popup.wallCoordinates.length;
        right += 1
      ) {
        const a = popup.wallCoordinates[left]
        const b = popup.wallCoordinates[right]
        expect(
          a !== undefined && b !== undefined && areCardinallyAdjacent(a, b)
        ).toBe(false)
      }
    }

    const topEdgePostXs = popup.wallCoordinates
      .filter(({ y }) => y === 19)
      .map(({ x }) => x)
      .sort((a, b) => a - b)
    expect(
      topEdgePostXs.slice(1).map((x, index) =>
        x - (topEdgePostXs[index] ?? x)
      )
    )
      .toEqual([3, 3, 3])

    for (const wallCoordinate of popup.wallCoordinates) {
      expect(tentWallVariant(popup.wallCoordinates, wallCoordinate)).not
        .toBe("none")
    }
  })
})
