import type { List } from "immutable"

export const MAX_VISIBLE_MESSAGES = 50

type Props = {
  messages: List<string>
}

export default function Messages({ messages }: Props) {
  const visibleMessages = messages.take(MAX_VISIBLE_MESSAGES)

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
      <ul
        role="list"
        style={{ margin: 0, padding: 0, listStyle: "none" }}
      >
        {visibleMessages.map((message, index) => (
          <li role="listitem" key={`${index}:${message}`}>
            {message}
          </li>
        )).toArray()}
      </ul>
    </div>
  )
}
