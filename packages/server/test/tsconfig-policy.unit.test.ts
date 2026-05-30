import { describe, expect, it } from "@effect/vitest"
import { existsSync, readFileSync } from "node:fs"
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
    readonly paths?: Readonly<Record<string, ReadonlyArray<string>>>
  }
}

const readRootTsConfig = (): RootTsConfig =>
  JSON.parse(readFileSync(rootTsConfigPath, "utf8")) as RootTsConfig

const sourceExistsForPathTarget = (target: string): boolean =>
  existsSync(join(repositoryRoot, target))
  || (target.endsWith(".js")
    && existsSync(
      join(repositoryRoot, `${target.slice(0, -".js".length)}.ts`)
    ))

const isPackageRootIndexAliasTarget = (target: string): boolean =>
  target.endsWith("/src/index.js")
  || target.endsWith("/src/index.ts")

describe("root TypeScript config policy", () => {
  it("refuses to emit build artifacts when type errors are present", () => {
    expect(readRootTsConfig().compilerOptions?.noEmitOnError).toBe(true)
  })

  it("does not point package root aliases at missing source indexes", () => {
    const paths = readRootTsConfig().compilerOptions?.paths ?? {}
    const missingIndexAliases = Object.entries(paths).flatMap(
      ([alias, targets]) =>
        targets
          .filter(
            (target) =>
              isPackageRootIndexAliasTarget(target)
              && !sourceExistsForPathTarget(target)
          )
          .map((target) => [alias, target])
    )

    expect(missingIndexAliases).toEqual([])
  })
})
