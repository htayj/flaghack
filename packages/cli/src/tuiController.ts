import {
  type Action,
  EAction,
  type Entity as EntitySchema,
  type Key as KeySchema,
  type Pos as PosSchema,
  type World as WorldSchema
} from "@flaghack/domain/schemas"
import { Effect, HashMap, Option } from "effect"
import { GameClient } from "./GameClient.js"
import { LiveRuntime } from "./runtime.js"
import {
  type BlessedKeyLike,
  clampTravelTarget,
  directionalMovementResultMessage,
  findPlayerPosition,
  findTravelDirections,
  isBaseMovementInput,
  MAX_TRAVEL_STEPS,
  MAX_VISIBLE_MESSAGES,
  movementCommandRequiresRepeatedMovement,
  type MovementPrefix,
  moveTravelTarget,
  normalizeGameInput,
  parseExtendedCommand,
  parseInput,
  parseMovementCommand,
  type RepeatedMovementCommand,
  runDirectionalMovement,
  samePosition,
  travelPrompt,
  travelResultMessage
} from "./tuiGame.js"

const apiDoPlayerAction = GameClient.doPlayerAction
const apiGetInventory = GameClient.getInventory
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
const apiGetWorld = GameClient.getWorld

type Entity = typeof EntitySchema.Type
type Key = typeof KeySchema.Type
type Pos = typeof PosSchema.Type
type World = typeof WorldSchema.Type

export type AlternateTuiPopupKind = "pickup" | "drop"

export type AlternateTuiPopup = {
  readonly kind: AlternateTuiPopupKind
  readonly title: string
  readonly items: ReadonlyArray<Entity>
  readonly marked: ReadonlySet<Key>
}

export type AlternateTuiSnapshot = {
  readonly world: World
  readonly inventory: World
  readonly messages: ReadonlyArray<string>
  readonly travelTarget?: Pos | undefined
  readonly popup?: AlternateTuiPopup | undefined
}

type SnapshotListener = (snapshot: AlternateTuiSnapshot) => void
type LiveRuntimeEffect = Parameters<typeof LiveRuntime.runPromise>[0]

const emptyWorld = (): World => HashMap.empty()

const entityList = (world: World): ReadonlyArray<Entity> =>
  Array.from(world.pipe(HashMap.values))

const itemKeys = (items: ReadonlyArray<Entity>): ReadonlySet<Key> =>
  new Set(items.map((item) => item.key))

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class AlternateTuiController {
  private activeAutoMoveId: number | undefined
  private inventory: World = emptyWorld()
  private readonly listeners = new Set<SnapshotListener>()
  private markedPopupItems: ReadonlySet<Key> = new Set()
  private messages: ReadonlyArray<string> = []
  private nextAutoMoveId = 0
  private pendingExtendedCommand: string | undefined
  private pendingMovementPrefix: MovementPrefix | undefined
  private pickupContents: World = emptyWorld()
  private pickupRequestId = 0
  private popupKind: AlternateTuiPopupKind | undefined
  private travelTarget: Pos | undefined
  private world: World = emptyWorld()

  constructor(
    private readonly options: {
      readonly debugMessages?: boolean | undefined
      readonly onQuit?: (() => void) | undefined
    } = {}
  ) {}

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  snapshot(): AlternateTuiSnapshot {
    return {
      inventory: this.inventory,
      messages: this.messages,
      popup: this.popupSnapshot(),
      travelTarget: this.travelTarget,
      world: this.world
    }
  }

  start(): void {
    this.launch(
      this.loadInitialWorldAndInventory().pipe(
        Effect.catchAllCause((cause) =>
          Effect.sync(() =>
            this.addMessage(`initial load failed: ${cause}`)
          )
        )
      )
    )
  }

  handleInput(input: string, key?: BlessedKeyLike): void {
    const normalizedInput = normalizeGameInput(input, key)

    if (this.cancelActiveAutoMove()) return

    if (this.popupKind !== undefined) {
      this.handlePopupInput(normalizedInput)
      return
    }

    this.addDebugMessage(`doing ${normalizedInput}`)

    if (this.pendingExtendedCommand !== undefined) {
      this.handleExtendedCommandKey(normalizedInput)
      return
    }

    if (this.travelTarget !== undefined) {
      this.handleTravelTargetKey(normalizedInput, this.travelTarget)
      return
    }

    if (normalizedInput === "#") {
      this.pendingMovementPrefix = undefined
      this.pendingExtendedCommand = ""
      this.addMessage("extended command: #")
      return
    }

    if (normalizedInput === "_") {
      this.pendingMovementPrefix = undefined
      const playerPosition = findPlayerPosition(this.world)
      if (Option.isSome(playerPosition)) {
        const initialTarget = clampTravelTarget(
          playerPosition.value,
          this.world
        )
        this.travelTarget = initialTarget
        this.addMessage(travelPrompt(initialTarget))
      } else {
        this.addMessage("cannot travel: player not found")
      }
      return
    }

    if (normalizedInput === ",") {
      this.openPickupPopup()
      return
    }

    if (normalizedInput === "d") {
      this.openDropPopup()
      return
    }

    let actionInput = normalizedInput
    const movementPrefix = this.pendingMovementPrefix
    if (movementPrefix !== undefined) {
      this.pendingMovementPrefix = undefined
      if (isBaseMovementInput(normalizedInput)) {
        actionInput = `${movementPrefix}+${normalizedInput}`
      }
    } else if (
      normalizedInput === "g"
      || normalizedInput === "G"
      || normalizedInput === "m"
      || normalizedInput === "M"
    ) {
      this.pendingMovementPrefix = normalizedInput
      return
    }

    const movementCommand = parseMovementCommand(actionInput)
    if (
      Option.isSome(movementCommand)
      && movementCommandRequiresRepeatedMovement(movementCommand.value)
    ) {
      this.runRepeatedMovement(movementCommand.value)
      return
    }

    const action = parseInput(actionInput)
    if (Option.isNone(action)) return

    this.runActionAndRefresh(action.value)
  }

  private addMessage(message: string): void {
    this.messages = [message, ...this.messages].slice(
      0,
      MAX_VISIBLE_MESSAGES
    )
    this.emit()
  }

  private addDebugMessage(message: string): void {
    if (this.options.debugMessages === true) {
      this.addMessage(message)
    }
  }

  private beginAutoMove(): number {
    this.nextAutoMoveId += 1
    this.activeAutoMoveId = this.nextAutoMoveId
    return this.nextAutoMoveId
  }

  private cancelActiveAutoMove(): boolean {
    if (this.activeAutoMoveId === undefined) return false

    this.activeAutoMoveId = undefined
    this.pendingMovementPrefix = undefined
    this.messages = ["automove canceled", ...this.messages].slice(
      0,
      MAX_VISIBLE_MESSAGES
    )
    this.emit()
    return true
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private finishAutoMove(autoMoveId: number): void {
    if (this.activeAutoMoveId === autoMoveId) {
      this.activeAutoMoveId = undefined
    }
  }

  private finishExtendedCommand(commandInput: string): void {
    const command = parseExtendedCommand(commandInput)
    this.pendingExtendedCommand = undefined
    if (Option.isSome(command) && command.value === "quit") {
      this.addMessage("quitting")
      this.options.onQuit?.()
    } else {
      this.addMessage(`unknown extended command: #${commandInput}`)
    }
  }

  private handleExtendedCommandKey(input: string): void {
    const commandInput = this.pendingExtendedCommand ?? ""
    switch (input) {
      case "escape":
        this.pendingExtendedCommand = undefined
        this.addMessage("canceled extended command")
        return
      case "C-h":
        this.pendingExtendedCommand = commandInput.slice(0, -1)
        this.emit()
        return
      case "enter":
      case "return":
      case "C-j":
        this.finishExtendedCommand(commandInput)
        return
      default:
        if (/^[a-z]$/iu.test(input)) {
          this.pendingExtendedCommand =
            `${commandInput}${input.toLowerCase()}`
          this.emit()
          return
        }
        this.pendingExtendedCommand = undefined
        this.emit()
    }
  }

  private handlePopupInput(input: string): void {
    switch (input) {
      case "q":
      case "r":
      case "escape":
        this.cancelPopup()
        return
      case ",":
        this.markedPopupItems = itemKeys(this.popupItems())
        this.emit()
        return
      case " ":
      case "space":
        this.submitPopup()
        return
      default:
        return
    }
  }

  private handleTravelTargetKey(input: string, target: Pos): void {
    switch (input) {
      case "escape":
        this.travelTarget = undefined
        this.addMessage("canceled travel")
        return
      case "enter":
      case "return":
      case "C-j": {
        const playerPosition = findPlayerPosition(this.world)
        this.travelTarget = undefined
        if (Option.isNone(playerPosition)) {
          this.addMessage("cannot travel: player not found")
          return
        }
        if (samePosition(playerPosition.value, target)) {
          this.addMessage("already there")
          return
        }
        const autoMoveId = this.beginAutoMove()
        this.addMessage("traveling")
        this.launch(
          this.runTravelToTarget(target, autoMoveId).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                if (this.isAutoMoveCancelled(autoMoveId)) return
                this.addMessage(travelResultMessage(result))
              })
            ),
            Effect.ensuring(
              Effect.sync(() => this.finishAutoMove(autoMoveId))
            )
          )
        )
        return
      }
      default: {
        const travelMovementCommand = parseMovementCommand(input)
        if (Option.isSome(travelMovementCommand)) {
          const nextTarget = moveTravelTarget(
            target,
            travelMovementCommand.value.dir,
            this.world
          )
          this.travelTarget = nextTarget
          this.addMessage(travelPrompt(nextTarget))
        }
      }
    }
  }

  private isAutoMoveCancelled(autoMoveId: number): boolean {
    return this.activeAutoMoveId !== autoMoveId
  }

  private launch(effect: LiveRuntimeEffect): void {
    void LiveRuntime.runPromise(effect).catch((error: unknown) => {
      this.addMessage(`error: ${errorMessage(error)}`)
    })
  }

  private loadInitialWorldAndInventory() {
    const setInventory = (inventory: World) => {
      this.inventory = inventory
      this.emit()
    }
    const setWorld = (world: World) => {
      this.world = world
      this.emit()
    }

    return Effect.gen(function*() {
      const world = yield* apiGetWorld
      yield* Effect.sync(() => setWorld(world))

      const inventory = yield* apiGetInventory.pipe(
        Effect.catchAllCause(() => Effect.succeed(emptyWorld()))
      )
      yield* Effect.sync(() => setInventory(inventory))
    })
  }

  private openDropPopup(): void {
    this.pendingMovementPrefix = undefined
    this.popupKind = "drop"
    this.markedPopupItems = new Set()
    this.addMessage("dropping")
  }

  private openPickupPopup(): void {
    this.pendingMovementPrefix = undefined
    this.popupKind = "pickup"
    this.pickupContents = emptyWorld()
    this.markedPopupItems = new Set()
    this.pickupRequestId += 1
    const pickupRequestId = this.pickupRequestId
    this.addMessage("picking up ")
    this.launch(
      apiGetPickupItemsFor("player").pipe(
        Effect.tap((contents) =>
          Effect.sync(() => {
            if (
              this.popupKind !== "pickup"
              || this.pickupRequestId !== pickupRequestId
            ) {
              return
            }
            this.pickupContents = contents
            this.emit()
          })
        )
      )
    )
  }

  private popupItems(): ReadonlyArray<Entity> {
    switch (this.popupKind) {
      case "pickup":
        return entityList(this.pickupContents)
      case "drop":
        return entityList(this.inventory)
      case undefined:
        return []
    }
  }

  private popupSnapshot(): AlternateTuiPopup | undefined {
    switch (this.popupKind) {
      case "pickup":
        return {
          items: this.popupItems(),
          kind: "pickup",
          marked: this.markedPopupItems,
          title: "Pickup what?"
        }
      case "drop":
        return {
          items: this.popupItems(),
          kind: "drop",
          marked: this.markedPopupItems,
          title: "Drop what?"
        }
      case undefined:
        return undefined
    }
  }

  private refreshWorldAndInventory() {
    return Effect.all({
      inventory: apiGetInventory,
      world: apiGetWorld
    }).pipe(
      Effect.tap(({ inventory, world }) =>
        Effect.sync(() => {
          this.inventory = inventory
          this.world = world
          this.emit()
        })
      )
    )
  }

  private runActionAndRefresh(action: Action): void {
    this.launch(
      apiDoPlayerAction(action).pipe(
        Effect.andThen(this.refreshWorldAndInventory())
      )
    )
  }

  private runRepeatedMovement(command: RepeatedMovementCommand): void {
    const autoMoveId = this.beginAutoMove()
    this.launch(
      runDirectionalMovement({
        command,
        isCancelled: () => this.isAutoMoveCancelled(autoMoveId),
        moveAndRefresh: (direction) =>
          apiDoPlayerAction(EAction.move({ dir: direction })).pipe(
            Effect.andThen(this.refreshWorldAndInventory())
          ),
        world: this.world
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (this.isAutoMoveCancelled(autoMoveId)) return
            this.addMessage(
              directionalMovementResultMessage(command, result)
            )
          })
        ),
        Effect.ensuring(Effect.sync(() => this.finishAutoMove(autoMoveId)))
      )
    )
  }

  private runTravelToTarget(target: Pos, autoMoveId: number) {
    const isCancelled = () => this.isAutoMoveCancelled(autoMoveId)
    const refreshWorldAndInventory = () => this.refreshWorldAndInventory()
    let currentWorld = this.world

    return Effect.gen(function*() {
      let steps = 0

      while (steps < MAX_TRAVEL_STEPS) {
        if (isCancelled()) {
          return { _tag: "cancelled", steps } as const
        }

        const playerPosition = findPlayerPosition(currentWorld)
        if (Option.isNone(playerPosition)) {
          return { _tag: "player-not-found", steps } as const
        }
        if (samePosition(playerPosition.value, target)) {
          return { _tag: "arrived", steps } as const
        }

        const firstDirection = findTravelDirections(
          currentWorld,
          playerPosition.value,
          target
        )[0]
        if (firstDirection === undefined) {
          return { _tag: "blocked", steps } as const
        }

        const beforePosition = playerPosition.value
        const refreshed = yield* apiDoPlayerAction(
          EAction.move({ dir: firstDirection })
        ).pipe(Effect.andThen(refreshWorldAndInventory()))
        steps += 1
        currentWorld = refreshed.world

        if (isCancelled()) {
          return { _tag: "cancelled", steps } as const
        }

        const afterPosition = findPlayerPosition(currentWorld)
        if (Option.isNone(afterPosition)) {
          return { _tag: "player-not-found", steps } as const
        }
        if (samePosition(beforePosition, afterPosition.value)) {
          return { _tag: "blocked", steps } as const
        }
      }

      return { _tag: "too-far", steps } as const
    })
  }

  private cancelPopup(): void {
    const kind = this.popupKind
    this.popupKind = undefined
    this.markedPopupItems = new Set()
    this.addMessage(
      kind === "drop" ? "canceling multidrop" : "canceling pickup"
    )
  }

  private submitPopup(): void {
    const kind = this.popupKind
    const currentItemKeys = itemKeys(this.popupItems())
    const keys = Array.from(this.markedPopupItems).filter((key) =>
      currentItemKeys.has(key)
    )
    this.popupKind = undefined
    this.markedPopupItems = new Set()
    if (kind === "pickup") {
      this.launch(
        apiDoPlayerAction(EAction.pickupMulti({ keys })).pipe(
          Effect.andThen(this.refreshWorldAndInventory())
        )
      )
    } else if (kind === "drop") {
      this.launch(
        apiDoPlayerAction(EAction.dropMulti({ keys })).pipe(
          Effect.andThen(this.refreshWorldAndInventory())
        )
      )
    } else {
      this.emit()
    }
  }
}
