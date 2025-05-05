import { Box } from "ink"
import React from "react"
import { AppMode } from "../app.jsx"

type Props = {
  mode: AppMode
}
export type Opts = { name: string }
export default function App({ mode }: Props) {
  return <Box>unsupported app mode: {mode}</Box>
}
