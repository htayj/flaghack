import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_SERVER_PORT,
  resolveSaveFilePath,
  resolveServerConfig,
  resolveServerPort
} from "../src/config.js"

const testDir = dirname(fileURLToPath(import.meta.url))
const serverSourcePath = join(testDir, "../src/server.ts")

describe("server runtime config", () => {
  it("defaults to port 3000 and an XDG/HOME save file path", () => {
    expect(resolveServerPort({})).toBe(DEFAULT_SERVER_PORT)
    expect(resolveServerConfig({ HOME: "/home/tester" })).toEqual({
      port: DEFAULT_SERVER_PORT,
      saveFilePath: "/home/tester/.local/state/flag-hack/save.json"
    })
    expect(resolveSaveFilePath({ XDG_STATE_HOME: "/state" })).toBe(
      "/state/flag-hack/save.json"
    )
  })

  it("uses trimmed FLAGHACK_PORT before PORT", () => {
    expect(
      resolveServerPort({ FLAGHACK_PORT: " 4001 ", PORT: "4002" })
    ).toBe(4001)
  })

  it("uses PORT when FLAGHACK_PORT is absent or empty", () => {
    expect(resolveServerPort({ PORT: " 4002 " })).toBe(4002)
    expect(resolveServerPort({ FLAGHACK_PORT: " ", PORT: "4003" }))
      .toBe(4003)
  })

  it("uses a trimmed explicit FLAGHACK_SAVE_PATH before XDG/HOME defaults", () => {
    expect(
      resolveServerConfig({
        FLAGHACK_SAVE_PATH: " /tmp/flaghack-save.json ",
        HOME: "/home/tester",
        XDG_STATE_HOME: "/state"
      })
    ).toEqual({
      port: DEFAULT_SERVER_PORT,
      saveFilePath: "/tmp/flaghack-save.json"
    })
  })

  it("falls back to the default when port env values are empty", () => {
    expect(resolveServerPort({ FLAGHACK_PORT: "", PORT: "   " })).toBe(
      DEFAULT_SERVER_PORT
    )
  })

  it("rejects non-integer and out-of-range ports", () => {
    expect(() => resolveServerPort({ FLAGHACK_PORT: "not-a-port" }))
      .toThrowError(/FLAGHACK_PORT.*integer from 1 to 65535/)
    expect(() => resolveServerPort({ PORT: "3.14" }))
      .toThrowError(/PORT.*integer from 1 to 65535/)
    expect(() => resolveServerPort({ PORT: "0" })).toThrowError(
      /PORT.*integer from 1 to 65535/
    )
    expect(() => resolveServerPort({ PORT: "65536" })).toThrowError(
      /PORT.*integer from 1 to 65535/
    )
  })

  it("wires server startup through runtime config instead of a hard-coded port", () => {
    const serverSource = readFileSync(serverSourcePath, "utf8")

    expect(serverSource).toMatch(/resolveServerConfig\s*\(\s*env\s*\)/)
    expect(serverSource).not.toContain("port: 3000")
  })
})
