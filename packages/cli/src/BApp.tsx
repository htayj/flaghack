import React from "react"
import BPlaying from "./components/BPlaying.js"

export type Opts = { name: string }
export type AppMode = "playing"
export type BAppProps = {
  readonly debugMessages?: boolean | undefined
  readonly onQuit?: (() => void) | undefined
}
export default function BApp(
  { debugMessages = false, onQuit }: BAppProps
) {
  return (
    <BPlaying
      debugMessages={debugMessages}
      username="test"
      onQuit={onQuit}
    />
  )
}
