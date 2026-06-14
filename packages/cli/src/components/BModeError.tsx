// import { Box } from "ink"
import React from "react"
// import blessed from "react-blessed"
// import { } from "react-blessed"
import type { AppMode } from "../BApp.js"

type Props = {
  mode: AppMode
}
export type Opts = { name: string }
export default function BModeError({ mode }: Props) {
  return <box>unsupported app mode: {mode}</box>
}
