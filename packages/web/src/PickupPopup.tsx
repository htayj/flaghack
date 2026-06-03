import type {
  Key as KeySchema,
  World as WorldSchema
} from "@flaghack/domain/schemas"
// import { HashMap } from "effect"
import { Map } from "immutable"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

type Key = typeof KeySchema.Type
type World = typeof WorldSchema.Type
type Props = {
  items: World
  open: boolean
  onSubmit: (keys: ReadonlyArray<Key>) => void
  onCancel: () => void
}

export default function PickupPopup(
  { items, onCancel, onSubmit, open }: Props
) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [marked, setMarked] = useState<ReadonlySet<Key>>(
    () => new Set<Key>()
  )

  useEffect(() => {
    if (!open) {
      return
    }

    dialogRef.current?.focus()
  }, [open])
  const invMap = useMemo(() => Map(items), [items])
  const markAll = useCallback(() =>
    setMarked(
      () =>
        new Set<Key>(
          invMap.valueSeq().toArray().map((e) => e.key)
        )
    ), [invMap])
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      return
    }

    event.stopPropagation()

    if (event.key === " ") {
      event.preventDefault()
      onSubmit(Array.from(marked))
      return
    }
    if (event.key.toLowerCase() === "q") {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === ",") {
      event.preventDefault()
      markAll()
    }
  }
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Pick up items"
      aria-hidden={!open}
      tabIndex={-1}
      style={{
        position: "absolute",
        left: "25vw",
        right: "55vw",
        top: "25vh",
        bottom: "55vh",
        border: "solid",
        display: open ? "inherit" : "none"
      }}
      onKeyDown={handleKeyDown}
    >
      <div role="list">
        {invMap.valueSeq().toArray().map((item) => (
          <div
            role="listitem"
            key={item.key}
            style={{
              display: "block",
              background: marked.has(item.key) ? "#aaa" : "#000"
            }}
          >
            {item._tag}
          </div>
        ))}
      </div>
    </div>
  )
}
