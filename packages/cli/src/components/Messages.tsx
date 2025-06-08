import React from "react"
// import {Box, Text} from 'ink';
import { List } from "immutable"

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
