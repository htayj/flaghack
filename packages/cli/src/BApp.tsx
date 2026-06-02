import React from "react"
import BPlaying from "./components/BPlaying.js"

export type Opts = { name: string }
export type AppMode = "playing"
export default function BApp() {
  return <BPlaying username="test" />
}
