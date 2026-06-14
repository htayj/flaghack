import React from "react"
import BPlaying from "./components/BPlaying.js"

export type Opts = { name: string }
export type AppMode = "playing"
export type BAppProps = {
  readonly onQuit?: (() => void) | undefined
}
export default function BApp({ onQuit }: BAppProps) {
  return <BPlaying username="test" onQuit={onQuit} />
}
