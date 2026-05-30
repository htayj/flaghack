import { describe, expect, it } from "@effect/vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const rootTsConfigPath = join(repositoryRoot, "tsconfig.base.json")

const packageTsConfigPaths = [
  "packages/cli/tsconfig.src.json",
  "packages/cli/tsconfig.test.json",
  "packages/server/tsconfig.src.json",
  "packages/server/tsconfig.test.json"
] as const

const expectedDomainSourceReference = "../domain/tsconfig.src.json"

type RootTsConfig = {
  readonly compilerOptions?: {
    readonly noEmitOnError?: unknown
    readonly paths?: Readonly<Record<string, ReadonlyArray<string>>>
  }
}

type ProjectTsConfig = {
  readonly references?: ReadonlyArray<{
    readonly path?: unknown
  }>
}

const readJsonFile = <A>(path: string): A =>
  JSON.parse(readFileSync(path, "utf8")) as A

const readRootTsConfig = (): RootTsConfig => readJsonFile(rootTsConfigPath)

const readProjectTsConfig = (relativePath: string): ProjectTsConfig =>
  readJsonFile(join(repositoryRoot, relativePath))

const domainReferencePaths = (
  relativePath: string
): ReadonlyArray<string> => {
  const references = readProjectTsConfig(relativePath).references ?? []

  return references.flatMap((reference) =>
    typeof reference.path === "string"
      && reference.path.startsWith("../domain")
      ? [reference.path]
      : []
  )
}

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

  it("uses the domain source project from CLI and server source/test configs", () => {
    const domainReferencesByConfig = Object.fromEntries(
      packageTsConfigPaths.map((configPath) => [
        configPath,
        domainReferencePaths(configPath)
      ])
    )

    expect(domainReferencesByConfig).toEqual({
      "packages/cli/tsconfig.src.json": [expectedDomainSourceReference],
      "packages/cli/tsconfig.test.json": [expectedDomainSourceReference],
      "packages/server/tsconfig.src.json": [expectedDomainSourceReference],
      "packages/server/tsconfig.test.json": [expectedDomainSourceReference]
    })
  })
})
