import { describe, expect, it } from "@effect/vitest"
import type { UserConfig } from "vite"
import webConfig from "../vite.config"

const domainSchemasImport = "@flaghack/domain/schemas"

type RollupExternalOption = NonNullable<
  NonNullable<
    NonNullable<UserConfig["build"]>["rollupOptions"]
  >["external"]
>

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

describe("web Vite config", () => {
  it("bundles domain schemas for browser builds", () => {
    expect(
      externalizesImport(
        webConfig.build?.rollupOptions?.external,
        domainSchemasImport
      )
    ).toBe(false)
  })
})
