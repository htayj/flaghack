import { describe, expect, it } from "@effect/vitest"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"
import type { UserConfig } from "vite"
import webConfig from "../vite.config"

const domainSchemasImport = "@flaghack/domain/schemas"
const webTsconfigPath = fileURLToPath(
  new URL("../tsconfig.app.json", import.meta.url)
)
const webNodeTsconfigPath = fileURLToPath(
  new URL("../tsconfig.node.json", import.meta.url)
)
const strictIndexedAccessTsconfigPaths = [
  ["tsconfig.app.json", webTsconfigPath],
  ["tsconfig.node.json", webNodeTsconfigPath]
] as const

type RollupExternalOption = NonNullable<
  NonNullable<
    NonNullable<UserConfig["build"]>["rollupOptions"]
  >["external"]
>

type WebTsconfig = {
  readonly compilerOptions?: {
    readonly baseUrl?: string
    readonly noUncheckedIndexedAccess?: boolean
    readonly paths?: Record<string, ReadonlyArray<string>>
  }
}

const externalizesImport = (
  external: RollupExternalOption | undefined,
  importId: string
): boolean => {
  if (external === undefined) {
    return false
  }

  if (typeof external === "string") {
    return external === importId
  }

  if (external instanceof RegExp) {
    return external.test(importId)
  }

  if (Array.isArray(external)) {
    return external.some((entry) => externalizesImport(entry, importId))
  }

  return external(importId, undefined, false) === true
}

const readWebTsconfig = (tsconfigPath = webTsconfigPath): WebTsconfig => {
  const parsed = ts.parseConfigFileTextToJson(
    tsconfigPath,
    readFileSync(tsconfigPath, "utf8")
  )

  if (parsed.error !== undefined) {
    throw new Error(String(parsed.error.messageText))
  }

  return parsed.config as WebTsconfig
}

const isBarePackageAlias = (alias: string): boolean =>
  !alias.includes("*")
  && (alias.startsWith("@")
    ? alias.split("/").length === 2
    : !alias.includes("/"))

const isSourcePackageIndexTarget = (target: string): boolean =>
  /(?:^|\/)src\/index\.[cm]?[tj]sx?$/.test(target)

describe("web Vite config", () => {
  it("bundles domain schemas for browser builds", () => {
    expect(
      externalizesImport(
        webConfig.build?.rollupOptions?.external,
        domainSchemasImport
      )
    ).toBe(false)
  })

  it("enables strict indexed access checks in web tsconfigs", () => {
    for (const [name, tsconfigPath] of strictIndexedAccessTsconfigPaths) {
      expect(
        readWebTsconfig(tsconfigPath).compilerOptions
          ?.noUncheckedIndexedAccess,
        `${name} must enable noUncheckedIndexedAccess`
      ).toBe(true)
    }
  })

  it("does not alias bare packages to missing source indexes", () => {
    const tsconfig = readWebTsconfig()
    const pathAliases = tsconfig.compilerOptions?.paths ?? {}
    const pathAliasBase = resolve(
      dirname(webTsconfigPath),
      tsconfig.compilerOptions?.baseUrl ?? "."
    )
    const missingBareSourceIndexes = Object.entries(pathAliases).flatMap(
      ([alias, targets]) =>
        isBarePackageAlias(alias)
          ? targets
            .filter(isSourcePackageIndexTarget)
            .filter((target) =>
              !existsSync(resolve(pathAliasBase, target))
            )
            .map((target) => `${alias} -> ${target}`)
          : []
    )

    expect(missingBareSourceIndexes).toEqual([])
  })
})
