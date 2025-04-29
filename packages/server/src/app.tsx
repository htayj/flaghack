import React, { useState } from "react"
import { CliType } from "./cli.jsx"
import ModeError from "./components/ModeError.jsx"
import Playing from "./components/Playing.jsx"

type Props = {
  opts: CliType
}
export type Opts = { name: string }
export type AppMode = "playing"
export default function App({}: Props) {
  const [mode] = useState<AppMode>("playing")

  return mode === "playing"
    ? <Playing username="test" />
    : <ModeError mode={mode} />
}
