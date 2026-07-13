#!/usr/bin/env tsx

const noTrackerHiddenDestinationsOrStatusAddress = String
  .raw`Objective:|[Qq]uest(?:-| )tracker|Campground Directory|Water Station|The Effigy|The Temple|Address:`

process.env.FLAGHACK_TMUX_LABEL ??= "campground"
process.env.FLAGHACK_TMUX_WINDOW_WIDTH ??= "120"
process.env.FLAGHACK_TMUX_PAUSE_AT_OPENING_EXPOSITION = "true"
process.env.FLAGHACK_TMUX_STEPS = JSON.stringify([
  {
    expect: String
      .raw`You wake in the mud[\s\S]*wake naked[\s\S]*face down in a puddle of mud[\s\S]*Rain hammers down[\s\S]*cannot remember how you got[\s\S]*here\.[\s\S]*You are carrying nothing\.[\s\S]*Enter/Space continues`,
    keys: [],
    label: "opening-exposition",
    reject: noTrackerHiddenDestinationsOrStatusAddress
  },
  {
    expect: String
      .raw`\(empty\)[\s\S]*;;;@G[\s\S]*Weather: heavy rain`,
    keys: ["Enter"],
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
