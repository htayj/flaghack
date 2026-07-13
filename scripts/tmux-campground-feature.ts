#!/usr/bin/env tsx

const noTrackerHiddenDestinationsOrStatusAddress = String
  .raw`Objective:|[Qq]uest(?:-| )tracker|Campground Directory|Water Station|The Effigy|The Temple|Address:`

process.env.FLAGHACK_TMUX_LABEL ??= "campground"
process.env.FLAGHACK_TMUX_WINDOW_WIDTH ??= "240"
process.env.FLAGHACK_TMUX_STEPS = JSON.stringify([
  {
    expect: String
      .raw`You wake naked and face down in a puddle of mud just off the road\.[\s\S]*Rain hammers down around you,[\s\S]*cannot[\s\S]*remember how you got here\.[\s\S]*\(empty\)[\s\S]*;;;@G[\s\S]*Weather: heavy rain`,
    keys: [],
    label: "brutal-arrival",
    reject: noTrackerHiddenDestinationsOrStatusAddress
  },
  {
    expect: String
      .raw`Campground overview[\s\S]*Current address: (?!unknown(?:\r?\n|$))[^\r\n]+[\s\S]*Weather: heavy rain[\s\S]*Discovered destinations:[\s\S]*Arrival Plaza`,
    keys: ["O"],
    label: "overview",
    reject: noTrackerHiddenDestinationsOrStatusAddress
  },
  {
    expect: String.raw`Talk direction: hjkl/yubn, Esc cancel`,
    keys: ["O", "t"],
    label: "talk",
    reject: noTrackerHiddenDestinationsOrStatusAddress
  },
  {
    expect: String.raw`travel where\?[\s\S]*Arrival Plaza`,
    keys: ["Escape", "_"],
    label: "travel",
    reject: noTrackerHiddenDestinationsOrStatusAddress
  }
])

await import("./tmux-feature-check.js")
