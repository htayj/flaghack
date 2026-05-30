import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const rootTsConfigPath = join(repositoryRoot, "tsconfig.base.json")

type RootTsConfig = {
  readonly compilerOptions?: {
    readonly noEmitOnError?: unknown
  }
}

const readRootTsConfig = (): RootTsConfig =>
  JSON.parse(readFileSync(rootTsConfigPath, "utf8")) as RootTsConfig

describe("root TypeScript config policy", () => {
  it("refuses to emit build artifacts when type errors are present", () => {
    expect(readRootTsConfig().compilerOptions?.noEmitOnError).toBe(true)
  })
})
