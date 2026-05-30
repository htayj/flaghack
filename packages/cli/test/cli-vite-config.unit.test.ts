import { describe, expect, it } from "@effect/vitest"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfigFromFile } from "vite"

const domainPackage = "@flaghack/domain"
const domainSchemasImport = `${domainPackage}/schemas`
const testDir = dirname(fileURLToPath(import.meta.url))
const configPath = join(testDir, "../vite.config.js")

type ExternalPredicate = (
  source: string,
  importer: string | undefined,
  isResolved: boolean
) => unknown

const loadCliViteConfig = async () => {
  const result = await loadConfigFromFile(
    { command: "build", mode: "production" },
    configPath
  )

  if (result === null) {
    throw new Error(`Failed to load CLI Vite config at ${configPath}`)
  }

  return result.config
}

const externalEntryMatchesDomainSchemas = (entry: unknown): boolean => {
  if (typeof entry === "string") {
    return entry === domainSchemasImport
  }

  return entry instanceof RegExp && entry.test(domainSchemasImport)
}

const externalizesDomainSchemas = (external: unknown): boolean => {
  if (Array.isArray(external)) {
    return external.some(externalEntryMatchesDomainSchemas)
  }

  if (typeof external === "function") {
    return (external as ExternalPredicate)(
      domainSchemasImport,
      undefined,
      false
    ) === true
  }

  return externalEntryMatchesDomainSchemas(external)
}

const noExternalPackages = (noExternal: unknown): Array<string> =>
  Array.isArray(noExternal)
    ? noExternal.filter(
      (packageName): packageName is string =>
        typeof packageName === "string"
    )
    : []

describe("CLI Vite config", () => {
  it("bundles domain schemas instead of keeping a bare workspace import", async () => {
    const config = await loadCliViteConfig()

    expect(
      externalizesDomainSchemas(config.build?.rollupOptions?.external)
    ).toBe(false)
  })

  it("marks the domain workspace package as noExternal for SSR builds", async () => {
    const config = await loadCliViteConfig()

    expect(noExternalPackages(config.ssr?.noExternal)).toContain(
      domainPackage
    )
  })
})
