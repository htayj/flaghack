import type { List } from "immutable"

type Props = {
  messages: List<string>
}

export default function Messages({ messages }: Props) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Messages"
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
