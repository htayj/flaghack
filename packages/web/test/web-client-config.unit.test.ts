import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_WEB_API_BASE_URL,
  resolveWebApiBaseUrl
} from "../src/config.js"

const testDir = dirname(fileURLToPath(import.meta.url))
const gameClientSourcePath = join(testDir, "../src/GameClient.ts")

describe("web API client config", () => {
  it("defaults to the localhost smoke API", () => {
    expect(resolveWebApiBaseUrl({})).toBe(DEFAULT_WEB_API_BASE_URL)
  })

  it("uses the trimmed VITE_FLAGHACK_API_URL override", () => {
    expect(
      resolveWebApiBaseUrl({
        VITE_FLAGHACK_API_URL: " https://api.example.test "
      })
    ).toBe("https://api.example.test")
  })

  it("falls back to the default when VITE_FLAGHACK_API_URL is empty", () => {
    expect(resolveWebApiBaseUrl({ VITE_FLAGHACK_API_URL: "   " })).toBe(
      DEFAULT_WEB_API_BASE_URL
    )
  })

  it("wires GameClient through Vite runtime config instead of a hard-coded base URL", () => {
    const gameClientSource = readFileSync(gameClientSourcePath, "utf8")

    expect(gameClientSource).toMatch(
      /resolveWebApiBaseUrl\s*\(\s*import\.meta\.env\s*\)/
    )
    expect(gameClientSource).not.toContain(
      "baseUrl: \"http://localhost:3000\""
    )
  })
})
