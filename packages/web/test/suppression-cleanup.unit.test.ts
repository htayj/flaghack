import { describe, expect, it } from "@effect/vitest"
import { readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const sourceDirectory = fileURLToPath(new URL("../src/", import.meta.url))
const sourceExtensions = new Set([".ts", ".tsx"])

const sourceFiles = (directory: string): Array<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return sourceFiles(path)
    }

    return sourceExtensions.has(extname(entry.name)) ? [path] : []
  })

const forbiddenSnippets = [
  "@ts-ignore",
  "document.getElementById(\"root\")!"
] as const

type Finding = {
  file: string
  line: number
  snippet: typeof forbiddenSnippets[number]
  text: string
}

const findForbiddenSnippets = (): Array<Finding> =>
  sourceFiles(sourceDirectory).flatMap((path) => {
    const file = relative(sourceDirectory, path)
    const lines = readFileSync(path, "utf8").split(/\r?\n/)

    return lines.flatMap((text, index) =>
      forbiddenSnippets
        .filter((snippet) => text.includes(snippet))
        .map((snippet) => ({
          file,
          line: index + 1,
          snippet,
          text: text.trim()
        }))
    )
  })

describe("web TypeScript suppression cleanup", () => {
  it("keeps web sources free of scoped suppression regressions", () => {
    expect(findForbiddenSnippets()).toEqual([])
  })
})
