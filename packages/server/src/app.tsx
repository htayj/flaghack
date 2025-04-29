import React, { useState } from "react"
import { CliType } from "./cli.jsx"
import ModeError from "./components/ModeError.tsx"
import Playing from "./components/Playing.tsx"

type Props = {
  opts: CliType
}
export type Opts = { name: string }
export type AppMode = "playing"
export default function App({}: Props) {
  const [mode, setMode] = useState<AppMode>("playing")

  return mode === "playing" ? <Playing username="test" /> : <ModeError mode={mode} />
}
