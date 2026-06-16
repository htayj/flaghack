import type { List } from "immutable"
import React from "react"
import { MAX_VISIBLE_MESSAGES } from "../tuiGame.js"
import { MESSAGE_LOG_HEIGHT, PLAY_AREA_WIDTH } from "./layout.js"
// import {Box, Text} from 'ink';

export { MAX_VISIBLE_MESSAGES, MESSAGE_LOG_HEIGHT }

type Props = {
  messages: List<string>
}

export default function Messages({ messages }: Props) {
  return (
    <box
      border="line"
      top={0}
      left={0}
      height={MESSAGE_LOG_HEIGHT}
      width={PLAY_AREA_WIDTH}
    >
      {messages.join("\n")}
    </box>
  )
}
