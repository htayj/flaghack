import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_CLI_API_BASE_URL,
  resolveCliApiBaseUrl
} from "../src/config.js"

const testDir = dirname(fileURLToPath(import.meta.url))
const gameClientSourcePath = join(testDir, "../src/GameClient.ts")

describe("CLI API client config", () => {
  it("defaults to the local smoke API", () => {
    expect(resolveCliApiBaseUrl({})).toBe(DEFAULT_CLI_API_BASE_URL)
  })

  it("uses the trimmed FLAGHACK_API_URL override", () => {
    expect(
      resolveCliApiBaseUrl({
        FLAGHACK_API_URL: " https://api.example.test "
      })
    ).toBe("https://api.example.test")
  })

  it("falls back to the default when FLAGHACK_API_URL is empty", () => {
    expect(resolveCliApiBaseUrl({ FLAGHACK_API_URL: "   " })).toBe(
      DEFAULT_CLI_API_BASE_URL
    )
  })

  it("wires GameClient through runtime config instead of a hard-coded base URL", () => {
    const gameClientSource = readFileSync(gameClientSourcePath, "utf8")

    expect(gameClientSource).toMatch(
      /resolveCliApiBaseUrl\s*\(\s*process\.env\s*\)/
    )
    expect(gameClientSource).not.toContain(
      "baseUrl: \"http://127.0.0.1:3000\""
    )
  })
})
