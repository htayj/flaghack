import type {
  CampgroundFavorPhase as CampgroundFavorPhaseSchema,
  MissingFlagPhase as MissingFlagPhaseSchema
} from "@flaghack/domain/schemas"
import {
  type CampgroundCampDefinition,
  campgroundCamps,
  deterministicCampgroundChoice,
  formatCampgroundAddress,
  getCampgroundCamp,
  getCampgroundLandmark
} from "./campground.js"
import {
  type CampgroundRoute,
  type DiscoverableCampgroundPlace
} from "./campgroundNavigation.js"

export type CampgroundFavorPhase = typeof CampgroundFavorPhaseSchema.Type
export type MissingFlagPhase = typeof MissingFlagPhaseSchema.Type

export type CampgroundDialogueRole =
  | "greeter"
  | "camp-host"
  | "resident"
  | "ranger"
  | "temple-caretaker"

export type CampgroundDialogueTopic =
  | "missing-flag"
  | "favor"
  | "directions"
  | "discovery"
  | "flavor"
  | "repeat"

export type CampgroundFavorId =
  | "welcome-message"
  | "tool-run"
  | "water-run"

export interface CampgroundFavorReward {
  readonly description: string
  readonly id: string
  /** Prevents completed-favor conversation from minting another reward. */
  readonly oncePerRun: boolean
}

export interface CampgroundFavorContent {
  readonly id: CampgroundFavorId
  readonly name: string
  readonly offer: string
  readonly objectiveByPhase: Readonly<
    Record<CampgroundFavorPhase, string | undefined>
  >
  readonly ready: string
  readonly completion: string
  readonly repeat: string
  readonly reward: CampgroundFavorReward
}

export interface KeyedToolRunFavor extends CampgroundFavorContent {
  readonly id: "tool-run"
  readonly requiredItemKey: string
}

export interface CampgroundFavorDialogueState {
  readonly content: CampgroundFavorContent
  readonly phase: CampgroundFavorPhase
}

export interface CampgroundDialogueContext {
  readonly discoveredPlaceKeys?: ReadonlyArray<string>
  readonly favor?: CampgroundFavorDialogueState
  readonly hiddenPlaceKeys?: ReadonlyArray<string>
  readonly missingFlagPhase?: MissingFlagPhase
  readonly places?: ReadonlyArray<DiscoverableCampgroundPlace>
  readonly repeat?: boolean
  readonly requestedRoute?: CampgroundRoute
  readonly seed: number
  readonly speakerKey: string
  readonly turn: number
}

export interface CampgroundDialogueResult {
  readonly destination?: DiscoverableCampgroundPlace
  readonly message: string
  readonly topic: CampgroundDialogueTopic
}

const campLabel = (id: string): string => {
  const camp = getCampgroundCamp(id)
  return camp === undefined
    ? id
    : `${camp.name} (${formatCampgroundAddress(camp.address)})`
}

export const welcomeMessageFavor: CampgroundFavorContent = {
  id: "welcome-message",
  name: "Welcome to Camp",
  offer:
    "The arrival ranger mentions that The Dusty Spoon is waiting to hear whether the gate lantern is lit.",
  objectiveByPhase: {
    unavailable: undefined,
    offered: "The ranger has a few quiet words for someone passing by.",
    active: "The Dusty Spoon has not heard the gate-lantern news.",
    ready: "The message has reached the breakfast camp.",
    completed: "The Dusty Spoon knows that arrivals are still coming in."
  },
  ready: "So the gate lantern is lit again. Good to know.",
  completion: "That was the word we were waiting for. Have a pancake.",
  repeat: "The griddle is still hot if you smell another batch coming.",
  reward: {
    description: "A single pancake from The Dusty Spoon.",
    id: "dusty-spoon-pancake",
    oncePerRun: true
  }
}

export const toolRunFavor: CampgroundFavorContent = {
  id: "tool-run",
  name: "The Right Tool",
  offer: `${
    campLabel("patch-bay")
  } once loaned out a hammer with two blue notches in its handle.`,
  objectiveByPhase: {
    unavailable: undefined,
    offered: "The blue-notched hammer is still unaccounted for.",
    active: "Patch Bay's borrowed hammer has not wandered back.",
    ready: "The wear marks match the empty loop at the effigy.",
    completed: "The blue-notched hammer is hanging by the effigy again."
  },
  ready: "That's the one—the marks on the handle match.",
  completion: "Perfect. A similar tool would not have fit the repair.",
  repeat: "The right tool is back on the right hook. Thanks again.",
  reward: {
    description: "The Patch Bay host shares a useful temple rumor.",
    id: "patch-bay-rumor",
    oncePerRun: true
  }
}

export const keyToolRunFavor = (
  requiredItemKey: string
): KeyedToolRunFavor => ({
  ...toolRunFavor,
  id: "tool-run",
  requiredItemKey
})

export const waterRunFavor: CampgroundFavorContent = {
  id: "water-run",
  name: "Water for a Neighbor",
  offer:
    "The Pulse Dome host rattles an empty bottle beneath the speakers.",
  objectiveByPhase: {
    unavailable: undefined,
    offered: "The host's water bottle is empty.",
    active: "The music is louder than the host's thirst.",
    ready: "A water bottle sloshes within earshot of the dome.",
    completed: "The host has water again."
  },
  ready: "Yes, that water is for me. Thank you for remembering.",
  completion:
    "That helps more than you know. I heard something odd about the missing flags.",
  repeat:
    "I'm all set for water now—please save the rest for someone else.",
  reward: {
    description: "The recipient shares one missing-flag rumor.",
    id: "water-favor-rumor",
    oncePerRun: true
  }
}

export const campgroundFavorContents = [
  welcomeMessageFavor,
  toolRunFavor,
  waterRunFavor
] as const satisfies ReadonlyArray<CampgroundFavorContent>

export type CampgroundPublicEventKind = "meal" | "workshop" | "dance"

export interface CampgroundPublicEventContent {
  readonly ambient: ReadonlyArray<string>
  readonly announcement: string
  readonly endingAnnouncement: string
  readonly hostCampId: string
  readonly id: CampgroundPublicEventKind
  readonly name: string
}

export const campgroundPublicEvents = [
  {
    id: "meal",
    name: "Community Breakfast",
    hostCampId: "dusty-spoon",
    announcement: `Breakfast is being served under cover at ${
      campLabel("dusty-spoon")
    }. Shake off the rain and bring a plate if you have one.`,
    endingAnnouncement:
      `Rain drums overhead as the last pancakes come off the griddle at ${
        campLabel("dusty-spoon")
      }.`,
    ambient: [
      "You hear plates and mugs clinking beneath a crowded canopy.",
      "The smell of pancakes and coffee carries through the rain."
    ]
  },
  {
    id: "workshop",
    name: "Open Repair Workshop",
    hostCampId: "patch-bay",
    announcement: `The covered repair benches are open at ${
      campLabel("patch-bay")
    }. Bring something that rattles and keep it out of the rain.`,
    endingAnnouncement: `The open workshop at ${
      campLabel("patch-bay")
    } is packing up its tools before the runoff reaches them.`,
    ambient: [
      "You hear patient hammer taps beneath the workshop tarp.",
      "A bicycle wheel clicks beneath the steady drumming of rain."
    ]
  },
  {
    id: "dance",
    name: "Dust-Off Dance",
    hostCampId: "pulse-dome",
    announcement: `Music is starting under the canopy at ${
      campLabel("pulse-dome")
    }. Follow the addressed camp signs through the rain.`,
    endingAnnouncement: `The final song at ${
      campLabel("pulse-dome")
    } fades into applause and rain on canvas.`,
    ambient: [
      "A bass pulse and scattered cheers carry through the downpour.",
      "You hear dancers clapping beneath a rain-battered canopy."
    ]
  }
] as const satisfies ReadonlyArray<CampgroundPublicEventContent>

const missingFlagLinePools: Readonly<
  Record<
    Exclude<MissingFlagPhase, "not-started" | "returned">,
    ReadonlyArray<string>
  >
> = {
  "seeking-rumors": [
    `Several people at ${
      campLabel("flag-lab")
    } have been comparing stories about vanished flags.`,
    "The missing flags were last seen above ground, but the stories all end near the temple."
  ],
  "temple-lead": [
    "The temple caretaker keeps pausing whenever a cool draft rises through the floorboards.",
    "Dusty bootprints circle the temple stairs, then vanish below."
  ],
  "flag-retrieved": [
    "That fabric has the same weather-faded edge people were arguing about earlier.",
    "Somewhere above, somebody is probably still cursing the empty line where that used to hang."
  ]
}

const repeatLinePools: Readonly<
  Record<CampgroundDialogueRole, ReadonlyArray<string>>
> = {
  greeter: [
    "Get under canvas before the cold rain gets into you.",
    "The road markers are still visible if you get close enough."
  ],
  "camp-host": [
    "Make yourself at home, and leave the walkway clear.",
    "If you need anything, ask whoever looks least busy."
  ],
  resident: [
    "Good to see you again.",
    "The runoff keeps moving, but the camp is still here."
  ],
  ranger: [
    "Tell me a camp name or address and I can check the current route.",
    "The directory uses the same markers as the camp signs."
  ],
  "temple-caretaker": [
    "Please keep your voice down near the temple.",
    "The air from the stairs is still unusually cool."
  ]
}

const roleFlavorLines = (
  role: CampgroundDialogueRole,
  camp: CampgroundCampDefinition | undefined
): ReadonlyArray<string> => {
  if (camp !== undefined) return camp.barks
  if (role === "greeter") {
    return [welcomeMessageFavor.offer, welcomeMessageFavor.repeat]
  }
  if (role === "temple-caretaker") {
    return getCampgroundLandmark("temple")?.barks
      ?? repeatLinePools[role]
  }
  return repeatLinePools[role]
}

const deterministicLine = (
  lines: ReadonlyArray<string>,
  context: CampgroundDialogueContext,
  identity: string
): string =>
  deterministicCampgroundChoice(
    lines,
    context.seed,
    `${context.speakerKey}:${context.turn}:${identity}`
  ) ?? "..."

const missingFlagDialogue = (
  context: CampgroundDialogueContext,
  role: CampgroundDialogueRole
): CampgroundDialogueResult | undefined => {
  const phase = context.missingFlagPhase
  if (
    phase === undefined || phase === "not-started" || phase === "returned"
  ) return undefined

  return {
    message: deterministicLine(
      missingFlagLinePools[phase],
      context,
      `${role}:missing-flag:${phase}`
    ),
    topic: "missing-flag"
  }
}

const favorDialogue = (
  context: CampgroundDialogueContext
): CampgroundDialogueResult | undefined => {
  const favor = context.favor
  if (favor === undefined || favor.phase === "unavailable") {
    return undefined
  }

  switch (favor.phase) {
    case "offered":
      return { message: favor.content.offer, topic: "favor" }
    case "active":
      return {
        message: favor.content.objectiveByPhase.active
          ?? favor.content.offer,
        topic: "favor"
      }
    case "ready":
      return { message: favor.content.ready, topic: "favor" }
    case "completed":
      return { message: favor.content.repeat, topic: "repeat" }
  }
}

const selectCampgroundDialogue = (
  role: CampgroundDialogueRole,
  context: CampgroundDialogueContext,
  camp: CampgroundCampDefinition | undefined
): CampgroundDialogueResult => {
  const progression = missingFlagDialogue(context, role)
    ?? favorDialogue(context)
  if (progression !== undefined) return progression

  if (role === "ranger" && context.requestedRoute !== undefined) {
    return {
      destination: context.requestedRoute.destination,
      message: context.requestedRoute.directions,
      topic: "directions"
    }
  }

  const repeating = context.repeat ?? false
  const lines = repeating
    ? repeatLinePools[role]
    : roleFlavorLines(role, camp)
  const flavor = deterministicLine(
    lines,
    context,
    `${role}:${camp?.id ?? "civic"}:${repeating ? "repeat" : "flavor"}`
  )

  return {
    message: camp === undefined || repeating
      ? flavor
      : `Welcome to ${camp.name} at ${
        formatCampgroundAddress(camp.address)
      }. ${flavor}`,
    topic: repeating ? "repeat" : "flavor"
  }
}

export const greeterDialogue = (
  context: CampgroundDialogueContext
): CampgroundDialogueResult =>
  selectCampgroundDialogue("greeter", context, undefined)

export const campHostDialogue = (
  camp: CampgroundCampDefinition,
  context: CampgroundDialogueContext
): CampgroundDialogueResult =>
  selectCampgroundDialogue("camp-host", context, camp)

export const residentDialogue = (
  camp: CampgroundCampDefinition,
  context: CampgroundDialogueContext
): CampgroundDialogueResult =>
  selectCampgroundDialogue("resident", context, camp)

export const rangerDialogue = (
  context: CampgroundDialogueContext
): CampgroundDialogueResult =>
  selectCampgroundDialogue("ranger", context, undefined)

export const templeCaretakerDialogue = (
  context: CampgroundDialogueContext
): CampgroundDialogueResult =>
  selectCampgroundDialogue("temple-caretaker", context, undefined)

export const repeatCampgroundDialogue = (
  role: CampgroundDialogueRole,
  context: CampgroundDialogueContext,
  camp?: CampgroundCampDefinition
): CampgroundDialogueResult =>
  selectCampgroundDialogue(role, { ...context, repeat: true }, camp)

export const flagshipDialogueCamps = campgroundCamps.filter(({ kind }) =>
  kind === "flagship"
)
