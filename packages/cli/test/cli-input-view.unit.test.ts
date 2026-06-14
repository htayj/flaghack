import { describe, expect, it } from "@effect/vitest"
import {
  type Action,
  EAction,
  type Entity as EntitySchema,
  type World as WorldSchema
} from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { List } from "immutable"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"
import {
  clampTravelTarget,
  findTravelDirections,
  MAX_DIRECTIONAL_MOVEMENT_STEPS,
  type MovementCommand,
  movementCommandRequiresRepeatedMovement,
  type MovementDirection,
  normalizeGameInput,
  parseExtendedCommand,
  parseInput,
  parseMovementCommand,
  prependMessage,
  runDirectionalMovement,
  shouldStopDirectionalRun
} from "../src/components/BPlaying.js"
import { MAX_VISIBLE_MESSAGES } from "../src/components/Messages.js"

const bPlayingSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/components/BPlaying.tsx"
)

const readBPlayingSource = () => readFileSync(bPlayingSourcePath, "utf8")

type Direction = "N" | "E" | "S" | "W" | "NE" | "NW" | "SE" | "SW"
type DirectionCase = readonly [input: string, direction: Direction]
type Entity = typeof EntitySchema.Type
type World = typeof WorldSchema.Type

const worldFromEntities = (entities: ReadonlyArray<Entity>): World =>
  HashMap.fromIterable(
    entities.map((entity) => [entity.key, entity] as const)
  )

const floorAt = (x: number, y: number): Entity => ({
  _tag: "floor",
  at: { x, y, z: 0 },
  in: "world",
  key: `floor-${x}-${y}`
})
const tunnelAt = (x: number, y: number): Entity => ({
  _tag: "tunnel",
  at: { x, y, z: 0 },
  in: "world",
  key: `tunnel-${x}-${y}`
})
const wallAt = (x: number, y: number): Entity => ({
  _tag: "wall",
  at: { x, y, z: 0 },
  in: "world",
  key: `wall-${x}-${y}`,
  variant: "none"
})
const playerAt = (x: number, y: number): Entity => ({
  _tag: "player",
  at: { x, y, z: 0 },
  in: "world",
  key: "player",
  name: "you"
})
const hippieAt = (x: number, y: number): Entity => ({
  _tag: "hippie",
  at: { x, y, z: 0 },
  in: "world",
  key: `hippie-${x}-${y}`,
  name: "blocked"
})
const waterAt = (x: number, y: number): Entity => ({
  _tag: "water",
  at: { x, y, z: 0 },
  in: "world",
  key: `water-${x}-${y}`
})

const baseDirectionCases = [
  ["h", "W"],
  ["j", "S"],
  ["k", "N"],
  ["l", "E"],
  ["y", "NW"],
  ["u", "NE"],
  ["b", "SW"],
  ["n", "SE"]
] as const satisfies ReadonlyArray<DirectionCase>

const shiftedDirectionCases = baseDirectionCases.map(
  ([input, direction]) => [input.toUpperCase(), direction] as const
)
const controlDirectionCases = baseDirectionCases.map(
  ([input, direction]) => [`C-${input}`, direction] as const
)
const gPrefixDirectionCases = baseDirectionCases.map(
  ([input, direction]) => [`g+${input}`, direction] as const
)
const GPrefixDirectionCases = baseDirectionCases.map(
  ([input, direction]) => [`G+${input}`, direction] as const
)
const mPrefixDirectionCases = baseDirectionCases.map(
  ([input, direction]) => [`m+${input}`, direction] as const
)
const MPrefixDirectionCases = baseDirectionCases.map(
  ([input, direction]) => [`M+${input}`, direction] as const
)

const expectSomeAction = (
  actual: Option.Option<Action>,
  expected: Action
) => {
  expect(Option.isSome(actual)).toBe(true)
  if (Option.isSome(actual)) {
    expect(actual.value).toEqual(expected)
  }
}

const expectMovementCases = (cases: ReadonlyArray<DirectionCase>) => {
  for (const [input, direction] of cases) {
    expectSomeAction(parseInput(input), EAction.move({ dir: direction }))
  }
}

const expectMovementCommandCases = (
  cases: ReadonlyArray<DirectionCase>,
  tag: MovementCommand["_tag"]
) => {
  for (const [input, direction] of cases) {
    const actual = parseMovementCommand(input)
    expect(Option.isSome(actual)).toBe(true)
    if (Option.isSome(actual)) {
      expect(actual.value).toEqual({ _tag: tag, dir: direction })
    }
  }
}

const parseInputSignature =
  /(?:export\s+)?const\s+parseInput\s*=\s*\(\s*input\s*:\s*string\s*\)\s*:\s*Option\.Option\s*<\s*Action\s*>\s*=>\s*{/
const parseInputAnySignature =
  /const\s+parseInput\s*=\s*\(\s*input\s*:\s*any\s*\)/
const parseInputDefaultNoop =
  /default\s*:\s*return\s+EAction\.noop\s*\(\s*\)/
const parseInputDefaultUndefined = /default\s*:\s*return\s+undefined\b/
const parseInputDefaultNone =
  /default\s*:\s*return\s+Option\.none\s*\(\s*\)/
const handleGameKeySignature =
  /const\s+handleGameKey\s*=\s*\(\s*input\s*:\s*string(?:\s*,\s*key\s*\?\s*:\s*BlessedKeyLike)?\s*\)\s*=>\s*{/
const onDoPickupSignature =
  /const\s+onDoPickup\s*=\s*\(\s*pickupItems\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*{/
const onDoDropSignature =
  /const\s+onDoDrop\s*=\s*\(\s*dropItems\s*:\s*ReadonlyArray\s*<\s*Key\s*>\s*\)\s*=>\s*{/
const noActionGuardBeforeApiPattern =
  /const\s+action\s*=\s*parseInput\s*\(\s*\w+\s*\)\s*if\s*\(\s*Option\.isNone\s*\(\s*action\s*\)\s*\)\s*{\s*return\s*}/
const modeUseStateInitializer =
  /useState\s*<\s*Mode\s*>\s*\(\s*"normal"\s*\)/
const modeUseStateBinding =
  /const\s*\[\s*mode\b[\s\S]*?\]\s*=\s*useState\b/
const modeTypeAlias = /\btype\s+Mode\s*=/
const modeConstDeclaration = /\bconst\s+mode\b[^=\n]*=/
const modeIncludesConditional = /\.includes\s*\(\s*mode\s*\)/

type ForbiddenEffectAndThenUiSideEffect = {
  file: string
  line: number
  snippet: string
  text: string
}

const parseBPlayingSource = (source: string): ts.SourceFile =>
  ts.createSourceFile(
    "BPlaying.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

const sourceLine = (sourceFile: ts.SourceFile, node: ts.Node): number =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
  + 1

const nodeLineText = (sourceFile: ts.SourceFile, node: ts.Node): string =>
  node.getText(sourceFile).split(/\r?\n/, 1)[0]?.trim() ?? ""

const normalizedNodeText = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): string => node.getText(sourceFile).replace(/\s+/g, "")

const isEffectAndThenCall = (
  sourceFile: ts.SourceFile,
  node: ts.Node
): node is ts.CallExpression =>
  ts.isCallExpression(node)
  && node.expression.getText(sourceFile) === "Effect.andThen"

const findForbiddenUiBoundaryReferences = (
  sourceFile: ts.SourceFile,
  root: ts.Node,
  forbiddenSetters: ReadonlySet<string>,
  forbiddenRefOperations: ReadonlySet<string>
): Array<ForbiddenEffectAndThenUiSideEffect> => {
  const findings: Array<ForbiddenEffectAndThenUiSideEffect> = []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression)
        && forbiddenSetters.has(node.expression.text)
      ) {
        findings.push({
          file: "BPlaying.tsx",
          line: sourceLine(sourceFile, node),
          snippet: node.expression.text,
          text: nodeLineText(sourceFile, node)
        })
        return
      }

      const normalizedCall = normalizedNodeText(sourceFile, node)
      if (forbiddenRefOperations.has(normalizedCall)) {
        findings.push({
          file: "BPlaying.tsx",
          line: sourceLine(sourceFile, node),
          snippet: normalizedCall,
          text: nodeLineText(sourceFile, node)
        })
        return
      }
    } else if (
      ts.isIdentifier(node) && forbiddenSetters.has(node.text)
    ) {
      findings.push({
        file: "BPlaying.tsx",
        line: sourceLine(sourceFile, node),
        snippet: node.text,
        text: nodeLineText(sourceFile, node)
      })
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(root)
  return findings
}

const findForbiddenEffectAndThenUiBoundaries = (
  source: string
): Array<ForbiddenEffectAndThenUiSideEffect> => {
  const sourceFile = parseBPlayingSource(source)
  const forbiddenSetters = new Set([
    "setWorld",
    "setInventory",
    "setPickupContents"
  ])
  const forbiddenRefOperations = new Set([
    "pickupRef.current?.hide()",
    "dropRef.current?.hide()",
    "gameref.current?.focus()"
  ])
  const findings: Array<ForbiddenEffectAndThenUiSideEffect> = []

  const visit = (node: ts.Node) => {
    if (isEffectAndThenCall(sourceFile, node)) {
      for (const argument of node.arguments) {
        if (
          ts.isIdentifier(argument)
          && forbiddenSetters.has(argument.text)
        ) {
          findings.push({
            file: "BPlaying.tsx",
            line: sourceLine(sourceFile, argument),
            snippet: argument.text,
            text: nodeLineText(sourceFile, argument)
          })
        } else if (!ts.isIdentifier(argument)) {
          const nestedFindings = findForbiddenUiBoundaryReferences(
            sourceFile,
            argument,
            forbiddenSetters,
            forbiddenRefOperations
          )
          for (const finding of nestedFindings) {
            findings.push(finding)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return findings
}

const extractArrowFunctionBody = (
  source: string,
  signature: RegExp
): string => {
  const signatureMatch = source.match(signature)
  expect(signatureMatch).not.toBeNull()

  const signatureIndex = signatureMatch?.index ?? -1
  const openBraceIndex = source.indexOf("{", signatureIndex)
  expect(openBraceIndex).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index)
      }
    }
  }

  throw new Error("Could not find arrow function body terminator")
}

const extractConstInitializerSource = (
  source: string,
  identifier: string
): string => {
  const declaration = `const ${identifier} =`
  const declarationIndex = source.indexOf(declaration)
  expect(declarationIndex).toBeGreaterThanOrEqual(0)

  const initializerIndex = declarationIndex + declaration.length
  let depth = 0
  let started = false

  for (let index = initializerIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "(" || char === "{" || char === "[") {
      depth += 1
      started = true
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1
    } else if (char === "\n" && started && depth === 0) {
      return source.slice(declarationIndex, index)
    }
  }

  throw new Error(`Could not find initializer for ${identifier}`)
}

const indexAfter = (
  source: string,
  token: string,
  minimumIndex: number
) => {
  const index = source.indexOf(token)
  expect(index, `${token} should exist`).toBeGreaterThanOrEqual(0)
  expect(index, `${token} should be after the no-action guard`)
    .toBeGreaterThan(
      minimumIndex
    )
}

const expectRefreshAfterAction = (
  source: string,
  actionCall: string
) => {
  const actionIndex = source.indexOf(actionCall)
  expect(actionIndex, `${actionCall} should exist`).toBeGreaterThanOrEqual(
    0
  )

  const refreshIndex = source.indexOf(
    "Effect.andThen(refreshWorldAndInventory)",
    actionIndex
  )
  expect(
    refreshIndex,
    "refreshWorldAndInventory should run after the player action"
  ).toBeGreaterThan(actionIndex)
}

describe("CLI message log", () => {
  it("prepends new messages, caps stored state, and drops oldest tail entries", () => {
    const previousMessages = List(
      Array.from(
        { length: MAX_VISIBLE_MESSAGES },
        (_, index) => `message-${index}`
      )
    )
    const result = prependMessage("newest")(previousMessages)
    const expectedMessages = [
      "newest",
      ...previousMessages.take(MAX_VISIBLE_MESSAGES - 1).toArray()
    ]

    expect(result.first()).toBe("newest")
    expect(result.size).toBe(MAX_VISIBLE_MESSAGES)
    expect(result.toArray()).toEqual(expectedMessages)
    expect(result.includes(`message-${MAX_VISIBLE_MESSAGES - 1}`)).toBe(
      false
    )
  })

  it("keeps BPlaying message updates routed through the capping helper", () => {
    expect(readBPlayingSource()).not.toContain(
      "setMessages((messages) => messages.unshift("
    )
  })
})

describe("CLI NetHack movement input parser", () => {
  it("maps base vim directions to single-step movement actions", () => {
    expectMovementCases(baseDirectionCases)
  })

  it("classifies shifted vim directions as NetHack move-far commands", () => {
    expectMovementCommandCases(shiftedDirectionCases, "run-to-block")
    for (const [input] of shiftedDirectionCases) {
      expect(Option.isNone(parseInput(input))).toBe(true)
    }
  })

  it("classifies control vim directions as NetHack run commands", () => {
    expectMovementCommandCases(controlDirectionCases, "run")
    for (const [input] of controlDirectionCases) {
      expect(Option.isNone(parseInput(input))).toBe(true)
    }
  })

  it("classifies g-prefix vim directions as NetHack rush commands", () => {
    expectMovementCommandCases(gPrefixDirectionCases, "rush")
    for (const [input] of gPrefixDirectionCases) {
      expect(Option.isNone(parseInput(input))).toBe(true)
    }
  })

  it("classifies G-prefix vim directions as NetHack run commands", () => {
    expectMovementCommandCases(GPrefixDirectionCases, "run")
    for (const [input] of GPrefixDirectionCases) {
      expect(Option.isNone(parseInput(input))).toBe(true)
    }
  })

  it("maps m-prefix vim directions to no-pickup single-step movement actions", () => {
    expectMovementCommandCases(mPrefixDirectionCases, "no-pickup-walk")
    expectMovementCases(mPrefixDirectionCases)
  })

  it("classifies M-prefix vim directions as NetHack no-pickup move-far commands", () => {
    expectMovementCommandCases(MPrefixDirectionCases, "no-pickup-run")
    for (const [input] of MPrefixDirectionCases) {
      expect(Option.isNone(parseInput(input))).toBe(true)
    }
  })

  it("maps dot to the rest/no-op action", () => {
    expectSomeAction(parseInput("."), EAction.noop())
  })

  it("ignores unknown keys and bare movement prefixes", () => {
    for (
      const input of [
        "?",
        "g",
        "G",
        "m",
        "M",
        "g+?",
        "G+?",
        "m+?",
        "M+?"
      ]
    ) {
      expect(Option.isNone(parseInput(input))).toBe(true)
    }
  })
})

describe("CLI NetHack directional run behavior", () => {
  it("identifies repeated autorun commands", () => {
    expect(movementCommandRequiresRepeatedMovement({
      _tag: "run-to-block",
      dir: "E"
    })).toBe(true)
    expect(
      movementCommandRequiresRepeatedMovement({ _tag: "run", dir: "E" })
    )
      .toBe(true)
    expect(
      movementCommandRequiresRepeatedMovement({ _tag: "rush", dir: "E" })
    )
      .toBe(true)
    expect(movementCommandRequiresRepeatedMovement({
      _tag: "no-pickup-run",
      dir: "E"
    })).toBe(true)
    expect(
      movementCommandRequiresRepeatedMovement({ _tag: "walk", dir: "E" })
    )
      .toBe(false)
    expect(movementCommandRequiresRepeatedMovement({
      _tag: "no-pickup-walk",
      dir: "E"
    })).toBe(false)
  })

  it("repeats movement until blocked or no progress is made", async () => {
    const worlds = [
      worldFromEntities([playerAt(1, 0)]),
      worldFromEntities([playerAt(2, 0)]),
      worldFromEntities([playerAt(2, 0)])
    ]
    let refreshCount = 0

    const result = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0)]),
      command: { _tag: "run-to-block", dir: "E" },
      maxSteps: MAX_DIRECTIONAL_MOVEMENT_STEPS,
      moveAndRefresh: () =>
        Effect.succeed({
          world: worlds[Math.min(refreshCount++, worlds.length - 1)]
            ?? worlds.at(-1)
            ?? worldFromEntities([playerAt(2, 0)])
        })
    }))

    expect(result).toEqual({ _tag: "blocked", steps: 2 })
    expect(refreshCount).toBe(3)
  })

  it("cancels directional autorun before making the next move", async () => {
    let refreshCount = 0

    const result = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0)]),
      command: { _tag: "run-to-block", dir: "E" },
      isCancelled: () => refreshCount > 0,
      moveAndRefresh: () => {
        refreshCount += 1
        return Effect.succeed({
          world: worldFromEntities([playerAt(1, 0)])
        })
      }
    }))

    expect(result).toEqual({ _tag: "cancelled", steps: 1 })
    expect(refreshCount).toBe(1)
  })

  it("does not move when directional autorun is already cancelled", async () => {
    let refreshCount = 0

    const result = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0)]),
      command: { _tag: "run-to-block", dir: "E" },
      isCancelled: () => true,
      moveAndRefresh: () => {
        refreshCount += 1
        return Effect.succeed({
          world: worldFromEntities([playerAt(1, 0)])
        })
      }
    }))

    expect(result).toEqual({ _tag: "cancelled", steps: 0 })
    expect(refreshCount).toBe(0)
  })

  it("follows NetHack run corners through one-way tunnels", async () => {
    const tunnelCorner = [
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      tunnelAt(1, 1)
    ]
    const directions: Array<MovementDirection> = []

    const result = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0), ...tunnelCorner]),
      command: { _tag: "run", dir: "E" },
      moveAndRefresh: (direction) => {
        directions.push(direction)
        const nextPlayer = directions.length === 1
          ? playerAt(1, 0)
          : directions.length === 2
          ? playerAt(1, 1)
          : playerAt(1, 1)
        return Effect.succeed({
          world: worldFromEntities([nextPlayer, ...tunnelCorner])
        })
      }
    }))

    expect(directions).toEqual(["E", "S", "S"])
    expect(result).toEqual({ _tag: "blocked", steps: 2 })
  })

  it("treats g as NetHack rush: forks are interesting and corners are not auto-turned", async () => {
    const forkWorld = worldFromEntities([
      playerAt(1, 0),
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      tunnelAt(2, 0),
      tunnelAt(1, 1)
    ])

    expect(shouldStopDirectionalRun({
      command: { _tag: "rush", dir: "E" },
      direction: "E",
      world: forkWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(true)
    expect(shouldStopDirectionalRun({
      command: { _tag: "run", dir: "E" },
      direction: "E",
      world: forkWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(false)

    const rushResult = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0), tunnelAt(0, 0)]),
      command: { _tag: "rush", dir: "E" },
      moveAndRefresh: () => Effect.succeed({ world: forkWorld })
    }))

    expect(rushResult).toEqual({ _tag: "interesting", steps: 1 })
  })

  it("does not treat ordinary open room floor as a corridor fork", () => {
    const roomWorld = worldFromEntities([
      playerAt(1, 1),
      floorAt(0, 0),
      floorAt(1, 0),
      floorAt(2, 0),
      floorAt(0, 1),
      floorAt(1, 1),
      floorAt(2, 1),
      floorAt(0, 2),
      floorAt(1, 2),
      floorAt(2, 2)
    ])

    expect(shouldStopDirectionalRun({
      command: { _tag: "rush", dir: "E" },
      direction: "E",
      world: roomWorld,
      position: { x: 1, y: 1, z: 0 },
      previousPosition: { x: 0, y: 1, z: 0 }
    })).toBe(false)
  })

  it("stops after two same-direction NetHack corridor turns", async () => {
    const uTurnCorridor = [
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      tunnelAt(1, 1),
      tunnelAt(0, 1)
    ]
    const directions: Array<MovementDirection> = []

    const result = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0), ...uTurnCorridor]),
      command: { _tag: "run", dir: "E" },
      moveAndRefresh: (direction) => {
        directions.push(direction)
        const nextPlayer = directions.length === 1
          ? playerAt(1, 0)
          : directions.length === 2
          ? playerAt(1, 1)
          : playerAt(1, 1)
        return Effect.succeed({
          world: worldFromEntities([nextPlayer, ...uTurnCorridor])
        })
      }
    }))

    expect(directions).toEqual(["E", "S", "S"])
    expect(result).toEqual({ _tag: "blocked", steps: 2 })
  })

  it("stops shifted autorun before cardinal room exits but ignores diagonal rooms", async () => {
    const corridorToRoom = [
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      floorAt(2, 0),
      floorAt(2, 1)
    ]
    const diagonalRoomOnly = [
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      floorAt(2, 1)
    ]
    const directions: Array<MovementDirection> = []

    const roomResult = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0), ...corridorToRoom]),
      command: { _tag: "run-to-block", dir: "E" },
      moveAndRefresh: () =>
        Effect.succeed({
          world: worldFromEntities([playerAt(1, 0), ...corridorToRoom])
        })
    }))
    const diagonalResult = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0), ...diagonalRoomOnly]),
      command: { _tag: "run-to-block", dir: "E" },
      moveAndRefresh: (direction) => {
        directions.push(direction)
        const nextPlayer = directions.length === 1
          ? playerAt(1, 0)
          : playerAt(1, 0)
        return Effect.succeed({
          world: worldFromEntities([nextPlayer, ...diagonalRoomOnly])
        })
      }
    }))

    expect(roomResult).toEqual({ _tag: "interesting", steps: 1 })
    expect(diagonalResult).toEqual({ _tag: "blocked", steps: 1 })
    expect(directions).toEqual(["E", "E"])
  })

  it("moves into and through an adjacent room when shifted autorun starts at the doorway", async () => {
    const directions: Array<MovementDirection> = []
    const roomFromDoorway = [
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      floorAt(2, 0),
      floorAt(3, 0)
    ]

    const result = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(1, 0), ...roomFromDoorway]),
      command: { _tag: "run-to-block", dir: "E" },
      moveAndRefresh: (direction) => {
        directions.push(direction)
        const nextPlayer = directions.length === 1
          ? playerAt(2, 0)
          : directions.length === 2
          ? playerAt(3, 0)
          : playerAt(3, 0)
        return Effect.succeed({
          world: worldFromEntities([nextPlayer, ...roomFromDoorway])
        })
      }
    }))

    expect(result).toEqual({ _tag: "blocked", steps: 2 })
    expect(directions).toEqual(["E", "E", "E"])
  })

  it("stops shifted autorun at corridor forks and follows one-way corridor corners", async () => {
    const cardinalForkWorld = worldFromEntities([
      playerAt(1, 0),
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      tunnelAt(2, 0),
      tunnelAt(1, 1)
    ])
    const diagonalForkWorld = worldFromEntities([
      playerAt(1, 0),
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      tunnelAt(2, 0),
      tunnelAt(2, 1)
    ])
    const initialCornerCorridor = [
      tunnelAt(0, 0),
      tunnelAt(1, 0)
    ]
    const discoveredCornerCorridor = [
      tunnelAt(0, 0),
      tunnelAt(1, 0),
      tunnelAt(1, 1),
      floorAt(1, 2)
    ]
    const directions: Array<MovementDirection> = []

    for (const world of [cardinalForkWorld, diagonalForkWorld]) {
      expect(shouldStopDirectionalRun({
        command: { _tag: "run-to-block", dir: "E" },
        direction: "E",
        world,
        position: { x: 1, y: 0, z: 0 },
        previousPosition: { x: 0, y: 0, z: 0 }
      })).toBe(true)
    }

    const cornerResult = await Effect.runPromise(runDirectionalMovement({
      world: worldFromEntities([playerAt(0, 0), ...initialCornerCorridor]),
      command: { _tag: "run-to-block", dir: "E" },
      moveAndRefresh: (direction) => {
        directions.push(direction)
        const nextPlayer = directions.length === 1
          ? playerAt(1, 0)
          : directions.length === 2
          ? playerAt(1, 1)
          : playerAt(1, 1)
        return Effect.succeed({
          world: worldFromEntities([
            nextPlayer,
            ...discoveredCornerCorridor
          ])
        })
      }
    }))

    expect(directions).toEqual(["E", "S"])
    expect(cornerResult).toEqual({ _tag: "interesting", steps: 2 })
  })

  it("stops g/G runs at items and nearby creatures but lets shifted movement continue", () => {
    const itemWorld = worldFromEntities([
      playerAt(1, 0),
      floorAt(0, 0),
      floorAt(1, 0),
      floorAt(2, 0),
      waterAt(1, 0)
    ])
    const sideCreatureWorld = worldFromEntities([
      playerAt(1, 0),
      floorAt(0, 0),
      floorAt(1, 0),
      floorAt(2, 0),
      hippieAt(1, 1)
    ])
    const aheadCreatureWorld = worldFromEntities([
      playerAt(1, 0),
      floorAt(0, 0),
      floorAt(1, 0),
      floorAt(2, 0),
      hippieAt(2, 0)
    ])

    expect(shouldStopDirectionalRun({
      command: { _tag: "run", dir: "E" },
      direction: "E",
      world: itemWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(true)
    expect(shouldStopDirectionalRun({
      command: { _tag: "rush", dir: "E" },
      direction: "E",
      world: sideCreatureWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(true)
    expect(shouldStopDirectionalRun({
      command: { _tag: "run-to-block", dir: "E" },
      direction: "E",
      world: itemWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(false)
    expect(shouldStopDirectionalRun({
      command: { _tag: "run-to-block", dir: "E" },
      direction: "E",
      world: sideCreatureWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(false)
    expect(shouldStopDirectionalRun({
      command: { _tag: "run-to-block", dir: "E" },
      direction: "E",
      world: aheadCreatureWorld,
      position: { x: 1, y: 0, z: 0 },
      previousPosition: { x: 0, y: 0, z: 0 }
    })).toBe(true)
  })
})

describe("CLI NetHack key normalization", () => {
  it("normalizes blessed shifted and control direction events", () => {
    expect(normalizeGameInput("H", { full: "S-h" })).toBe("H")
    expect(normalizeGameInput("", { full: "S-g" })).toBe("G")
    expect(normalizeGameInput("", { full: "S-m" })).toBe("M")
    expect(normalizeGameInput("", { full: "S-3" })).toBe("#")
    expect(normalizeGameInput("", { full: "C-k" })).toBe("C-k")
    expect(normalizeGameInput("", { full: "backspace" })).toBe("C-h")
    expect(normalizeGameInput("", { full: "linefeed" })).toBe("C-j")
  })

  it("normalizes raw control characters used by common terminals", () => {
    expect(normalizeGameInput("\b")).toBe("C-h")
    expect(normalizeGameInput("\n")).toBe("C-j")
    expect(normalizeGameInput("\u000b")).toBe("C-k")
    expect(normalizeGameInput("\f")).toBe("C-l")
    expect(normalizeGameInput("\u0019")).toBe("C-y")
    expect(normalizeGameInput("\u0015")).toBe("C-u")
    expect(normalizeGameInput("\u0002")).toBe("C-b")
    expect(normalizeGameInput("\u000e")).toBe("C-n")
  })
})

describe("CLI NetHack travel pathfinding", () => {
  it("finds shortest travel directions across known passable map tiles", () => {
    const world = worldFromEntities([
      playerAt(0, 0),
      floorAt(0, 0),
      floorAt(1, 0),
      floorAt(2, 0)
    ])

    expect(findTravelDirections(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }
    )).toEqual(["E", "E"] satisfies ReadonlyArray<MovementDirection>)
  })

  it("does not route to an unknown or impassable travel target", () => {
    const world = worldFromEntities([
      playerAt(0, 0),
      floorAt(0, 0),
      wallAt(1, 0)
    ])

    expect(findTravelDirections(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 }
    )).toEqual([])
    expect(findTravelDirections(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }
    )).toEqual([])
  })

  it("treats creature-occupied floor tiles as blocked while routing", () => {
    const world = worldFromEntities([
      playerAt(0, 0),
      floorAt(0, 0),
      floorAt(1, 0),
      floorAt(2, 0),
      hippieAt(1, 0)
    ])

    expect(findTravelDirections(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }
    )).toEqual([])
  })

  it("keeps travel cursor targets inside the visible board", () => {
    expect(clampTravelTarget({ x: -5, y: -1, z: 0 })).toEqual({
      x: 0,
      y: 0,
      z: 0
    })
    expect(clampTravelTarget({ x: 100, y: 30, z: 0 })).toEqual({
      x: 79,
      y: 19,
      z: 0
    })
  })
})

describe("CLI NetHack extended command parser", () => {
  it("recognizes #quit and quit as the initial extended command", () => {
    expect(Option.isSome(parseExtendedCommand("#quit"))).toBe(true)
    expect(Option.isSome(parseExtendedCommand("quit"))).toBe(true)
  })

  it("ignores unsupported extended commands", () => {
    expect(Option.isNone(parseExtendedCommand("#pray"))).toBe(true)
  })
})

describe("CLI input handling static guards", () => {
  it("keeps parseInput string-typed with an explicit Option no-action default", () => {
    const source = readBPlayingSource()
    const parseInputBody = extractArrowFunctionBody(
      source,
      parseInputSignature
    )

    expect(source).toMatch(parseInputSignature)
    expect(source).not.toMatch(parseInputAnySignature)
    expect(parseInputBody).not.toMatch(parseInputDefaultNoop)
    expect(parseInputBody).not.toMatch(parseInputDefaultUndefined)
    expect(parseInputBody).toMatch(parseInputDefaultNone)
    expect(source).toContain("baseMovementDirections")
    expect(source).toContain("EAction.noop()")
  })

  it("defines an authoritative world/inventory refresh effect", () => {
    const source = readBPlayingSource()
    const refreshSource = extractConstInitializerSource(
      source,
      "refreshWorldAndInventory"
    )

    expect(refreshSource).toContain("Effect.all")
    expect(refreshSource).toMatch(/world\s*:\s*apiGetWorld\b/)
    expect(refreshSource).toMatch(/inventory\s*:\s*apiGetInventory\b/)
    expect(refreshSource).toContain("Effect.tap")
    expect(refreshSource).toContain("Effect.sync")
    expect(refreshSource).toMatch(/setWorld\s*\(\s*world\s*\)/)
    expect(refreshSource).toMatch(
      /setInventory\s*\(\s*inventory\s*\)/
    )
  })

  it("keeps UI state/ref side effects explicit inside Effect chains", () => {
    expect(findForbiddenEffectAndThenUiBoundaries(readBPlayingSource()))
      .toEqual([])
  })

  it("returns before action APIs and refreshes after movement actions", () => {
    const source = readBPlayingSource()
    const handleGameKeyBody = extractArrowFunctionBody(
      source,
      handleGameKeySignature
    )
    const guardMatch = handleGameKeyBody.match(
      noActionGuardBeforeApiPattern
    )

    expect(guardMatch).not.toBeNull()

    const guardEnd = (guardMatch?.index ?? 0)
      + (guardMatch?.[0].length ?? 0)
    indexAfter(
      handleGameKeyBody,
      "apiDoPlayerAction(action.value)",
      guardEnd
    )
    expectRefreshAfterAction(
      handleGameKeyBody,
      "apiDoPlayerAction(action.value)"
    )
    expect(handleGameKeyBody).not.toContain("Effect.andThen(apiGetWorld)")
    expect(handleGameKeyBody).not.toContain("apiGetInventory.pipe(")
  })

  it("refreshes world and inventory after pickup/drop actions", () => {
    const source = readBPlayingSource()
    const onDoPickupBody = extractArrowFunctionBody(
      source,
      onDoPickupSignature
    )
    const onDoDropBody = extractArrowFunctionBody(
      source,
      onDoDropSignature
    )

    expectRefreshAfterAction(
      onDoPickupBody,
      "apiDoPlayerAction(EAction.pickupMulti"
    )
    expectRefreshAfterAction(
      onDoDropBody,
      "apiDoPlayerAction(EAction.dropMulti"
    )
  })

  it("keeps the static UI mode out of React state and source", () => {
    const source = readBPlayingSource()

    expect(source).not.toMatch(modeUseStateInitializer)
    expect(source).not.toMatch(modeUseStateBinding)
    expect(source).not.toMatch(modeTypeAlias)
    expect(source).not.toMatch(modeConstDeclaration)
    expect(source).not.toMatch(modeIncludesConditional)
  })
})
