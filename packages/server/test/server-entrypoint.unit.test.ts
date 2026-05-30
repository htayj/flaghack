import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const serverSourcePath = fileURLToPath(
  new URL("../src/server.ts", import.meta.url)
)

const readServerSource = () => readFileSync(serverSourcePath, "utf8")

const restoreEnvValue = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe("server entrypoint", () => {
  it("exports helpers behind a direct-entry guard instead of launching at import time", () => {
    const serverSource = readServerSource()

    expect(serverSource).toContain("export const makeHttpLive")
    expect(serverSource).toContain("export const runServer")
    expect(serverSource).not.toMatch(
      /const\s+serverConfig\s*=\s*resolveServerConfig\s*\(\s*process\.env\s*\)/
    )
    expect(serverSource).not.toMatch(
      /Layer\.launch\(\s*HttpLive\s*\)\.pipe\(\s*NodeRuntime\.runMain\s*\)/
    )
    expect(serverSource).toMatch(
      /fileURLToPath\s*\(\s*import\.meta\.url\s*\)/
    )
    expect(serverSource).toContain("process.argv[1]")
    expect(serverSource).toMatch(/resolve\s*\(\s*entrypointPath\s*\)/)
  })

  it("does not read or validate process.env when imported", async () => {
    const originalFlaghackPort = process.env.FLAGHACK_PORT
    process.env.FLAGHACK_PORT = "not-a-valid-port"

    try {
      const serverModule = await import(
        "../src/server.js"
      ) as unknown as Record<
        string,
        unknown
      >

      expect(serverModule["makeHttpLive"]).toEqual(expect.any(Function))
      expect(serverModule["runServer"]).toEqual(expect.any(Function))
    } finally {
      restoreEnvValue("FLAGHACK_PORT", originalFlaghackPort)
    }
  })
})
