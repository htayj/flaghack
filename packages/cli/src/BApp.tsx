import React, { useState } from "react"
import BModeError from "./components/BModeError.js"
import BPlaying from "./components/BPlaying.js"

type Props = {}
export type Opts = { name: string }
export type AppMode = "playing"
export default function BApp({}: Props) {
  const [mode] = useState<AppMode>("playing")

  return mode === "playing"
    ? <BPlaying username="test" />
    : <BModeError mode={mode} />
}
