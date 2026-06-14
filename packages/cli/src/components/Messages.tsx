import type { List } from "immutable"
import React from "react"
import { MAX_VISIBLE_MESSAGES } from "../tuiGame.js"
// import {Box, Text} from 'ink';

export { MAX_VISIBLE_MESSAGES }

type Props = {
  messages: List<string>
}

export default function Messages({ messages }: Props) {
  return (
    <box border="line" top={0} left={0} height={12} width={82}>
      {messages.join("\n")}
    </box>
  )
}
