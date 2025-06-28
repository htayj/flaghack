import { List } from "immutable"
// @ts-ignore
import React from "react"

type Props = {
  messages: List<string>
}

export default function Messages({ messages }: Props) {
  return (
    <div
      style={{
        border: "solid",
        position: "absolute",
        top: 0,
        left: 0,
        height: "25vh",
        width: "100vw",
        overflow: "hidden"
      }}
    >
      {messages.join("\n")}
    </div>
  )
}
