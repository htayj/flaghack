import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const serverSourceRoot = join(repositoryRoot, "packages/server/src")

const countOccurrences = (source: string, needle: string): number =>
  source.split(needle).length - 1

const readServerSource = (path: string): string =>
  readFileSync(join(serverSourceRoot, path), "utf8")

describe("server source imports", () => {
  it("imports domain schemas from entity.ts once", () => {
    const entitySource = readServerSource("entity.ts")

    expect(
      countOccurrences(entitySource, "from \"@flaghack/domain/schemas\"")
    ).toBe(1)
  })

  it("imports effect/Option from items.ts once", () => {
    const itemsSource = readServerSource("items.ts")

    expect(countOccurrences(itemsSource, "from \"effect/Option\"")).toBe(1)
  })
})
