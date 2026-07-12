import {
  ClientStateStreamEventName,
  GameStateStreamPath,
  parseClientStateStreamEventJson,
  shouldAcceptClientStateStreamRevision
} from "@flaghack/domain/GameStream"
import type { ClientStateStreamEvent } from "@flaghack/domain/GameStream"
import { resolveWebApiBaseUrl } from "./config.js"

export type ClientStateStreamSubscription = {
  readonly close: () => void
}

export type SubscribeClientStateOptions = {
  readonly onError?: ((error: unknown) => void) | undefined
  readonly onUpdate: (event: ClientStateStreamEvent) => void
  readonly lastRevision?: number | undefined
}

export const clientStateStreamUrl = (baseUrl: string): string =>
  `${baseUrl.replace(/\/$/u, "")}${GameStateStreamPath}`

export const subscribeClientState = ({
  lastRevision = -1,
  onError,
  onUpdate
}: SubscribeClientStateOptions): ClientStateStreamSubscription => {
  if (typeof EventSource === "undefined") {
    throw new Error("EventSource is not available in this runtime")
  }

  let currentRevision = lastRevision
  const source = new EventSource(
    clientStateStreamUrl(resolveWebApiBaseUrl(import.meta.env))
  )

  source.addEventListener(ClientStateStreamEventName, (message) => {
    try {
      const event = parseClientStateStreamEventJson(message.data)
      if (
        !shouldAcceptClientStateStreamRevision(
          currentRevision,
          event.revision
        )
      ) {
        return
      }
      currentRevision = event.revision
      onUpdate(event)
    } catch (error) {
      onError?.(error)
    }
  })
  source.onerror = (error) => {
    onError?.(error)
  }

  return { close: () => source.close() }
}
