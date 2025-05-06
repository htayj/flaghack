// import { Box } from "ink"
import React from "react"
import blessed from "react-blessed"
// import { } from "react-blessed"
import { AppMode } from "../app.jsx"

type Props = {
  mode: AppMode
}
export type Opts = { name: string }
export default function BModeError({ mode }: Props) {
  return <box>unsupported app mode: {mode}</box>
}
