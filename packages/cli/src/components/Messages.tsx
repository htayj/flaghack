import React from "react"
// import {Box, Text} from 'ink';
import { List } from "immutable"

type Props = {
  messages: List<string>
}

export default function Messages({ messages }: Props) {
  return (
    <box border="line" top={0} left={0} height={30} width={80}>
      {messages.join("\n")}
    </box>
  )
}
