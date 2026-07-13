export const campgroundDistrictIds = [
  "north",
  "east",
  "south",
  "west"
] as const

export type CampgroundDistrictId = typeof campgroundDistrictIds[number]

export const campgroundRoadIds = [
  "lantern-road",
  "sunrise-spoke",
  "dusty-way",
  "sunset-spoke"
] as const

export type CampgroundRoadId = typeof campgroundRoadIds[number]

export interface CampgroundRoadDefinition {
  readonly id: CampgroundRoadId
  readonly name: string
  readonly district: CampgroundDistrictId
  readonly signLabel: string
}

export const campgroundRoads = [
  {
    id: "lantern-road",
    name: "Lantern Road",
    district: "north",
    signLabel: "NORTH / LANTERN ROAD"
  },
  {
    id: "sunrise-spoke",
    name: "Sunrise Spoke",
    district: "east",
    signLabel: "EAST / SUNRISE SPOKE"
  },
  {
    id: "dusty-way",
    name: "Dusty Way",
    district: "south",
    signLabel: "SOUTH / DUSTY WAY"
  },
  {
    id: "sunset-spoke",
    name: "Sunset Spoke",
    district: "west",
    signLabel: "WEST / SUNSET SPOKE"
  }
] as const satisfies ReadonlyArray<CampgroundRoadDefinition>

export interface CampgroundAddress {
  readonly district: CampgroundDistrictId
  readonly roadId: CampgroundRoadId
  readonly marker: string
}

export const campgroundCampKinds = ["flagship", "support"] as const
export type CampgroundCampKind = typeof campgroundCampKinds[number]

export const campgroundStructureMotifs = [
  "communal-kitchen",
  "repair-yard",
  "dance-dome",
  "art-yard",
  "shaded-lounge",
  "flag-workshop",
  "ranger-outpost",
  "quiet-garden",
  "tent-cluster",
  "tea-circle",
  "shade-court",
  "reading-nook"
] as const

export type CampgroundStructureMotif =
  typeof campgroundStructureMotifs[number]

export interface CampgroundStructureProfile {
  readonly motif: CampgroundStructureMotif
  readonly personalTents: number
  readonly popupCanopies: number
  readonly carports: number
}

export const campgroundActivityIds = [
  "breakfast",
  "repairs",
  "dancing",
  "art-making",
  "lounging",
  "flag-making",
  "ranger-help",
  "quiet-rest",
  "tea",
  "games",
  "storytelling",
  "stargazing",
  "bike-parking",
  "mending",
  "reading",
  "neighborhood-hangout"
] as const

export type CampgroundActivityId = typeof campgroundActivityIds[number]

export interface CampgroundCoolerLootProfile {
  readonly water: number
  readonly beer: number
  readonly hotdog: number
  readonly cheese: number
  readonly salsa: number
}

export interface CampgroundNpcMix {
  /** Relative resident activity; generation normalizes this to its NPC budget. */
  readonly hippies: number
  /** Fixed staffed ranger positions associated with the camp. */
  readonly rangers: number
  /** Relative road and open-playa traveler activity, not a headcount. */
  readonly travelers: number
}

export type CampgroundAmbientIntensity = "lively" | "moderate" | "quiet"

export interface CampgroundCampDefinition {
  readonly id: string
  readonly slot: number
  readonly name: string
  readonly kind: CampgroundCampKind
  readonly address: CampgroundAddress
  readonly structure: CampgroundStructureProfile
  readonly activity: CampgroundActivityId
  readonly coolerLoot: CampgroundCoolerLootProfile
  readonly npcMix: CampgroundNpcMix
  readonly ambientIntensity: CampgroundAmbientIntensity
  readonly barks: ReadonlyArray<string>
  readonly ambient: ReadonlyArray<string>
}

const loot = (
  water: number,
  beer: number,
  hotdog: number,
  cheese: number,
  salsa: number
): CampgroundCoolerLootProfile => ({ beer, cheese, hotdog, salsa, water })

const npcs = (
  hippies: number,
  rangers: number,
  travelers: number
): CampgroundNpcMix => ({ hippies, rangers, travelers })

const structure = (
  motif: CampgroundStructureMotif,
  personalTents: number,
  popupCanopies: number,
  carports: number
): CampgroundStructureProfile => ({
  carports,
  motif,
  personalTents,
  popupCanopies
})

/**
 * Stable slot order for the campground generator. Slots 0-7 are north,
 * 8-15 south, 16-19 west, and 20-23 east, matching the existing anchor order.
 */
export const campgroundCamps = [
  {
    id: "dusty-spoon",
    slot: 0,
    name: "The Dusty Spoon",
    kind: "flagship",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-1"
    },
    structure: structure("communal-kitchen", 1, 2, 1),
    activity: "breakfast",
    coolerLoot: loot(8, 1, 8, 2, 3),
    npcMix: npcs(4, 0, 2),
    ambientIntensity: "lively",
    barks: [
      "Pancakes are ready when the bubbles look like tiny moons.",
      "Grab a plate. Washing it afterward counts as a heroic deed."
    ],
    ambient: [
      "You hear a spatula scraping a broad iron griddle.",
      "The smell of coffee and singed pancakes drifts down the road."
    ]
  },
  {
    id: "patch-bay",
    slot: 1,
    name: "Patch Bay",
    kind: "flagship",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-2"
    },
    structure: structure("repair-yard", 2, 1, 1),
    activity: "repairs",
    coolerLoot: loot(5, 2, 2, 3, 1),
    npcMix: npcs(3, 0, 2),
    ambientIntensity: "moderate",
    barks: [
      "If it rattles, squeaks, or flaps, put it on the workbench.",
      "We can fix almost anything except a truly bad idea."
    ],
    ambient: [
      "You hear the patient tap of a mallet on bent metal.",
      "A bicycle wheel spins freely, clicking as it slows."
    ]
  },
  {
    id: "moth-lantern",
    slot: 2,
    name: "Moth Lantern",
    kind: "support",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-3"
    },
    structure: structure("tent-cluster", 3, 1, 0),
    activity: "neighborhood-hangout",
    coolerLoot: loot(4, 2, 1, 1, 0),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "We leave the little lantern on so everybody can find home.",
      "Mind the guy lines; they hunt ankles after dark."
    ],
    ambient: [
      "Paper lanterns rustle softly overhead.",
      "Someone hums while tying a careful knot."
    ]
  },
  {
    id: "pulse-dome",
    slot: 3,
    name: "The Pulse Dome",
    kind: "flagship",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-4"
    },
    structure: structure("dance-dome", 1, 2, 2),
    activity: "dancing",
    coolerLoot: loot(9, 6, 1, 0, 0),
    npcMix: npcs(5, 0, 3),
    ambientIntensity: "lively",
    barks: [
      "The floor is wherever your feet decide it is.",
      "The slow set begins whenever everyone gets tired."
    ],
    ambient: [
      "A round bass note rolls through the shade cloth.",
      "You hear clapping drift in and out of an uneven rhythm."
    ]
  },
  {
    id: "pocket-universe",
    slot: 4,
    name: "Pocket Universe",
    kind: "support",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-5"
    },
    structure: structure("shade-court", 2, 1, 1),
    activity: "games",
    coolerLoot: loot(5, 2, 2, 1, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "This board game is simple once you ignore half the rules.",
      "The tiny wooden moon means it is probably your turn."
    ],
    ambient: [
      "Wooden pieces clack against a folding table.",
      "A small group debates a rule in friendly whispers."
    ]
  },
  {
    id: "questionable-gallery",
    slot: 5,
    name: "Gallery of Questionable Decisions",
    kind: "flagship",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-6"
    },
    structure: structure("art-yard", 2, 2, 1),
    activity: "art-making",
    coolerLoot: loot(5, 3, 2, 2, 2),
    npcMix: npcs(4, 0, 2),
    ambientIntensity: "moderate",
    barks: [
      "Please touch the art. It has been feeling ignored.",
      "That sculpture started as a chair and made its own choices."
    ],
    ambient: [
      "A hand-cranked contraption squeaks and rings a tiny bell.",
      "You smell fresh paint warming in the sun."
    ]
  },
  {
    id: "tea-and-sympathy",
    slot: 6,
    name: "Tea and Sympathy",
    kind: "support",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-7"
    },
    structure: structure("tea-circle", 2, 1, 0),
    activity: "tea",
    coolerLoot: loot(7, 0, 1, 2, 0),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "The tea is mint. The sympathy is whatever you need.",
      "Sit for a minute; the road will still be there."
    ],
    ambient: [
      "A kettle lid chatters, then becomes still.",
      "Ceramic cups touch with a delicate clink."
    ]
  },
  {
    id: "hush-harbor",
    slot: 7,
    name: "Hush Harbor",
    kind: "flagship",
    address: {
      district: "north",
      roadId: "lantern-road",
      marker: "N-8"
    },
    structure: structure("quiet-garden", 4, 1, 1),
    activity: "quiet-rest",
    coolerLoot: loot(10, 0, 2, 2, 1),
    npcMix: npcs(3, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "Welcome. Voices low, shoulders lower.",
      "There are earplugs in the blue basket by the shade."
    ],
    ambient: [
      "A fabric wind chime turns without striking.",
      "You hear the slow breathing of people asleep in the shade."
    ]
  },
  {
    id: "soft-landing",
    slot: 8,
    name: "Soft Landing",
    kind: "flagship",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-1"
    },
    structure: structure("shaded-lounge", 3, 2, 2),
    activity: "lounging",
    coolerLoot: loot(10, 2, 3, 3, 2),
    npcMix: npcs(5, 0, 2),
    ambientIntensity: "moderate",
    barks: [
      "Every cushion is first come, first nap.",
      "You look like you have been standing for several minutes."
    ],
    ambient: [
      "Canvas billows above a crowded nest of cushions.",
      "A lazy cheer rises when someone finds the snack bowl."
    ]
  },
  {
    id: "flag-lab",
    slot: 9,
    name: "The Flag Lab",
    kind: "flagship",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-2"
    },
    structure: structure("flag-workshop", 2, 2, 1),
    activity: "flag-making",
    coolerLoot: loot(6, 2, 2, 2, 2),
    npcMix: npcs(4, 0, 2),
    ambientIntensity: "moderate",
    barks: [
      "A flag is just a story with excellent wind resistance.",
      "We are missing a few finished flags. Nobody remembers why."
    ],
    ambient: [
      "Scissors chew briskly through a length of bright fabric.",
      "A sewing machine runs, pauses, and runs again."
    ]
  },
  {
    id: "shade-tree",
    slot: 10,
    name: "Shade Tree",
    kind: "support",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-3"
    },
    structure: structure("shade-court", 2, 1, 1),
    activity: "neighborhood-hangout",
    coolerLoot: loot(7, 1, 2, 2, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "The tree is entirely fabric, but the shade is authentic.",
      "Pull up a bucket. We turned most of them into chairs."
    ],
    ambient: [
      "Green shade cloth snaps once in the breeze.",
      "Someone slowly shuffles a deck of cards."
    ]
  },
  {
    id: "lost-sock-exchange",
    slot: 11,
    name: "Lost Sock Exchange",
    kind: "support",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-4"
    },
    structure: structure("tent-cluster", 3, 1, 0),
    activity: "mending",
    coolerLoot: loot(4, 2, 1, 1, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "Take a sock, leave a sock, accept the mystery.",
      "Pairs are a social construct with warm feet."
    ],
    ambient: [
      "Clothespins creak along a line of unmatched socks.",
      "You hear thread pulled through heavy cloth."
    ]
  },
  {
    id: "ranger-post-nine",
    slot: 12,
    name: "Ranger Post Nine",
    kind: "flagship",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-5"
    },
    structure: structure("ranger-outpost", 2, 2, 1),
    activity: "ranger-help",
    coolerLoot: loot(14, 0, 4, 3, 1),
    npcMix: npcs(1, 4, 3),
    ambientIntensity: "moderate",
    barks: [
      "Lost? Tell me the last sign or landmark you remember.",
      "Water first, directions second, dramatic story afterward."
    ],
    ambient: [
      "A radio crackles with a calm location report.",
      "A ranger unfolds a map across a scarred table."
    ]
  },
  {
    id: "dust-bunnies",
    slot: 13,
    name: "Dust Bunnies",
    kind: "support",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-6"
    },
    structure: structure("tent-cluster", 4, 0, 1),
    activity: "neighborhood-hangout",
    coolerLoot: loot(5, 2, 2, 1, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "We swept once. The dust took it personally.",
      "The bunny ears are optional but strongly encouraged."
    ],
    ambient: [
      "A soft brush whispers across a ground cloth.",
      "Someone laughs quietly behind a pair of enormous ears."
    ]
  },
  {
    id: "slow-burn",
    slot: 14,
    name: "Slow Burn",
    kind: "support",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-7"
    },
    structure: structure("tea-circle", 2, 1, 0),
    activity: "storytelling",
    coolerLoot: loot(6, 1, 1, 2, 0),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "The short version of the story is still forty minutes.",
      "Stay until the ending. We have snacks for the middle."
    ],
    ambient: [
      "A storyteller pauses while the little circle waits.",
      "You hear a page turn and several contented sighs."
    ]
  },
  {
    id: "night-owl-nook",
    slot: 15,
    name: "Night Owl Nook",
    kind: "support",
    address: {
      district: "south",
      roadId: "dusty-way",
      marker: "S-8"
    },
    structure: structure("reading-nook", 3, 1, 0),
    activity: "reading",
    coolerLoot: loot(5, 1, 1, 2, 0),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "Borrow any book. Return any book. It evens out eventually.",
      "The owl lamp marks the shelf with the good mysteries."
    ],
    ambient: [
      "A shaded page turns in the warm breeze.",
      "A tiny reading lamp clicks on beneath the canopy."
    ]
  },
  {
    id: "solar-salon",
    slot: 16,
    name: "Solar Salon",
    kind: "support",
    address: {
      district: "west",
      roadId: "sunset-spoke",
      marker: "W-1"
    },
    structure: structure("shade-court", 2, 1, 1),
    activity: "mending",
    coolerLoot: loot(5, 2, 1, 2, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "The clippers charge all day and complain all night.",
      "Haircut, braid, or merely a very confident hat?"
    ],
    ambient: [
      "Electric clippers buzz briefly beneath the canopy.",
      "A mirror flashes sunlight across the road."
    ]
  },
  {
    id: "spare-parts",
    slot: 17,
    name: "Spare Parts",
    kind: "support",
    address: {
      district: "west",
      roadId: "sunset-spoke",
      marker: "W-2"
    },
    structure: structure("repair-yard", 2, 1, 1),
    activity: "repairs",
    coolerLoot: loot(4, 2, 2, 1, 0),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "We probably have that bolt, just not in the same units.",
      "The useful pile is the one with the red ribbon."
    ],
    ambient: [
      "A jar of loose hardware rattles on a workbench.",
      "Someone tests the tension on a length of cord."
    ]
  },
  {
    id: "cloud-library",
    slot: 18,
    name: "Cloud Library",
    kind: "support",
    address: {
      district: "west",
      roadId: "sunset-spoke",
      marker: "W-3"
    },
    structure: structure("reading-nook", 3, 1, 0),
    activity: "reading",
    coolerLoot: loot(6, 1, 1, 2, 0),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "Today's cloud catalog is mostly wisps with one excellent tower.",
      "Lie back. The reference section is directly overhead."
    ],
    ambient: [
      "A pencil scratches notes onto a weathered clipboard.",
      "Canvas creaks under someone settling in to watch the sky."
    ]
  },
  {
    id: "sunset-society",
    slot: 19,
    name: "Sunset Society",
    kind: "support",
    address: {
      district: "west",
      roadId: "sunset-spoke",
      marker: "W-4"
    },
    structure: structure("shaded-lounge", 2, 1, 1),
    activity: "storytelling",
    coolerLoot: loot(5, 3, 2, 2, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "Meeting starts when the sky does something impressive.",
      "Membership is free and expires every sunrise."
    ],
    ambient: [
      "Folding chairs scrape into a west-facing row.",
      "Someone quietly predicts the evening colors."
    ]
  },
  {
    id: "banana-phone",
    slot: 20,
    name: "Banana Phone",
    kind: "support",
    address: {
      district: "east",
      roadId: "sunrise-spoke",
      marker: "E-1"
    },
    structure: structure("tent-cluster", 3, 1, 0),
    activity: "games",
    coolerLoot: loot(4, 2, 2, 1, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "It only receives calls from other bananas.",
      "Leave a message after the imaginary beep."
    ],
    ambient: [
      "A toy telephone rings once, to everyone's surprise.",
      "Someone delivers an extremely serious fruit-related message."
    ]
  },
  {
    id: "cosmic-laundromat",
    slot: 21,
    name: "Cosmic Laundromat",
    kind: "support",
    address: {
      district: "east",
      roadId: "sunrise-spoke",
      marker: "E-2"
    },
    structure: structure("shade-court", 2, 1, 1),
    activity: "mending",
    coolerLoot: loot(7, 1, 1, 1, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "No machines, just washboards and unreasonable optimism.",
      "Clean is a direction, not a destination."
    ],
    ambient: [
      "Water sloshes softly in a sealed wash basin.",
      "Damp fabric snaps along a short clothesline."
    ]
  },
  {
    id: "odd-jobs",
    slot: 22,
    name: "Odd Jobs",
    kind: "support",
    address: {
      district: "east",
      roadId: "sunrise-spoke",
      marker: "E-3"
    },
    structure: structure("repair-yard", 2, 1, 1),
    activity: "repairs",
    coolerLoot: loot(5, 2, 3, 1, 1),
    npcMix: npcs(2, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "We specialize in tasks too strange for a normal clipboard.",
      "Need a knot held, a sign painted, or a sandwich supervised?"
    ],
    ambient: [
      "A pencil checks something off a very long list.",
      "You hear measuring tape snap back into its case."
    ]
  },
  {
    id: "friendly-neighborhood",
    slot: 23,
    name: "Friendly Neighborhood",
    kind: "support",
    address: {
      district: "east",
      roadId: "sunrise-spoke",
      marker: "E-4"
    },
    structure: structure("tent-cluster", 4, 1, 0),
    activity: "neighborhood-hangout",
    coolerLoot: loot(6, 2, 2, 2, 1),
    npcMix: npcs(3, 0, 1),
    ambientIntensity: "quiet",
    barks: [
      "You are a neighbor as soon as you stop walking past.",
      "If you borrowed the wrench, give it to whoever asks next."
    ],
    ambient: [
      "Several greetings overlap beneath a low canopy.",
      "A folding chair opens with a welcoming clatter."
    ]
  }
] as const satisfies ReadonlyArray<CampgroundCampDefinition>

export const campgroundLandmarkIds = [
  "arrival-plaza",
  "directory",
  "water-station",
  "central-effigy",
  "temple"
] as const

export type CampgroundLandmarkId = typeof campgroundLandmarkIds[number]

export type CampgroundLandmarkPlacement =
  | "arrival"
  | "arrival-road"
  | "center"
  | "temple"

export interface CampgroundLandmarkDefinition {
  readonly id: CampgroundLandmarkId
  readonly name: string
  readonly placement: CampgroundLandmarkPlacement
  readonly addressLabel: string
  readonly structureMotif: string
  readonly purpose: string
  readonly signText: string
  readonly barks: ReadonlyArray<string>
  readonly ambient: ReadonlyArray<string>
}

export const campgroundLandmarks = [
  {
    id: "arrival-plaza",
    name: "Arrival Plaza",
    placement: "arrival",
    addressLabel: "Gate and Main Road",
    structureMotif: "gate, shade, and a broad processional road",
    purpose: "welcome the player and establish the route to the center",
    signText: "WELCOME / WATER + DIRECTORY AHEAD / TEMPLE VIA CENTER",
    barks: [
      "Get under canvas. You can worry about directions after you stop shivering.",
      "The road is hard to miss. Everything else vanishes in the rain."
    ],
    ambient: [
      "Gate canvas flaps above the arriving crowd.",
      "A greeter calls out water and directory directions."
    ]
  },
  {
    id: "directory",
    name: "Campground Directory",
    placement: "arrival-road",
    addressLabel: "Main Road, just beyond Arrival Plaza",
    structureMotif: "large readable map board with district arms",
    purpose: "teach district, road, and marker addresses",
    signText: "N LANTERN / E SUNRISE / S DUSTY / W SUNSET",
    barks: [
      "Match the letter marker to the district arm, then follow the road signs.",
      "The effigy is central. The temple is beyond it."
    ],
    ambient: [
      "A map corner taps softly against its wooden backing.",
      "Someone traces a route across the directory with one finger."
    ]
  },
  {
    id: "water-station",
    name: "Water Station",
    placement: "arrival-road",
    addressLabel: "Main Road at the Directory",
    structureMotif: "shaded water racks and a staffed refill table",
    purpose: "provide an early resource and a natural first interaction",
    signText: "WATER / DRINK SOME / TAKE SOME",
    barks: [
      "Drink here, then carry enough to make it back.",
      "The refill line is short because everyone is helping."
    ],
    ambient: [
      "Water glugs into a row of waiting bottles.",
      "A metal cup rings against the refill table."
    ]
  },
  {
    id: "central-effigy",
    name: "The Effigy",
    placement: "center",
    addressLabel: "Center Junction",
    structureMotif: "open-air figure visible from every district road",
    purpose:
      "serve as the primary navigation landmark and social crossroads",
    signText: "CENTER / ALL DISTRICTS / TEMPLE ROAD CONTINUES",
    barks: [
      "Every district road eventually brings you back here.",
      "The quieter road past the effigy leads to the temple."
    ],
    ambient: [
      "Wind murmurs through the timbers of the effigy.",
      "Distant camp sounds overlap at the central junction."
    ]
  },
  {
    id: "temple",
    name: "The Temple",
    placement: "temple",
    addressLabel: "Far end of Temple Road",
    structureMotif:
      "quiet enclosed structure with stairs descending inside",
    purpose: "mark the tonal boundary between the social hub and dungeon",
    signText: "TEMPLE / QUIET PLEASE",
    barks: [
      "The temple is quieter than the rest of the campground.",
      "Those stairs were not part of the original plan."
    ],
    ambient: [
      "Campground noise fades near the temple walls.",
      "A cool draft rises from the stairs inside the temple."
    ]
  }
] as const satisfies ReadonlyArray<CampgroundLandmarkDefinition>

const roadById = new Map(
  campgroundRoads.map((road) => [road.id, road] as const)
)
const campById: ReadonlyMap<string, CampgroundCampDefinition> = new Map(
  campgroundCamps.map((camp) => [camp.id, camp] as const)
)
const landmarkById = new Map(
  campgroundLandmarks.map((landmark) => [landmark.id, landmark] as const)
)

export const getCampgroundRoad = (
  id: CampgroundRoadId
): CampgroundRoadDefinition | undefined => roadById.get(id)

export const getCampgroundCamp = (
  id: string
): CampgroundCampDefinition | undefined => campById.get(id)

export const getCampgroundCampAtSlot = (
  slot: number
): CampgroundCampDefinition | undefined => campgroundCamps.at(slot)

export const getCampgroundLandmark = (
  id: CampgroundLandmarkId
): CampgroundLandmarkDefinition | undefined => landmarkById.get(id)

export const formatCampgroundAddress = (
  address: CampgroundAddress
): string => {
  const road = getCampgroundRoad(address.roadId)
  return road === undefined
    ? address.marker
    : `${address.marker}, ${road.name}`
}

const hashCampgroundIdentity = (
  seed: number,
  identity: string
): number => {
  let hash = (2166136261 ^ seed) >>> 0
  for (const character of identity) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

/** Selects content without mutable random state, so snapshots and tests agree. */
export const deterministicCampgroundChoice = <T>(
  values: ReadonlyArray<T>,
  seed: number,
  identity: string
): T | undefined =>
  values.length === 0
    ? undefined
    : values.at(hashCampgroundIdentity(seed, identity) % values.length)
