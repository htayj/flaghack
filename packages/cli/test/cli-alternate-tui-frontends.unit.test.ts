import { describe, expect, it } from "@effect/vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { AlternateTuiController } from "../src/tuiController.js"

const testDir = dirname(fileURLToPath(import.meta.url))
const sourcePath = (fileName: string) => join(testDir, "../src", fileName)

const cliInkSourcePath = sourcePath("cliInk.tsx")
const cliTerminalKitSourcePath = sourcePath("cliTerminalKit.ts")
const tuiControllerSourcePath = sourcePath("tuiController.ts")
const charmMainSourcePath = join(testDir, "../charm/main.go")
const charmGoModPath = join(testDir, "../charm/go.mod")

const readSource = (path: string) => readFileSync(path, "utf8")

const blessedImports = /from\s+["'][^"']*(?:blessed|BPlaying)[^"']*["']/u

describe("alternate TUI frontend static guards", () => {
  it("keeps alternate frontends independent from blessed/BPlaying modules", () => {
    const sources = [
      readSource(cliInkSourcePath),
      readSource(cliTerminalKitSourcePath),
      readSource(tuiControllerSourcePath)
    ]

    for (const source of sources) {
      expect(source).not.toMatch(blessedImports)
      expect(source).toContain("./tuiGame.js")
    }
  })

  it("keeps debug input trace messages disabled by default", () => {
    const controller = new AlternateTuiController()

    controller.handleInput("?")

    expect(controller.snapshot().messages).toEqual([])
  })

  it("prompts alternate TUI users for open and close directions", () => {
    const controller = new AlternateTuiController()

    controller.handleInput("o")
    expect(controller.snapshot().messages[0]).toContain("Open direction")

    controller.handleInput("escape")
    controller.handleInput("c")
    expect(controller.snapshot().messages[0]).toContain("Close direction")
  })

  it("allows alternate clients to opt into debug input trace messages", () => {
    const controller = new AlternateTuiController({ debugMessages: true })

    controller.handleInput("?")

    expect(controller.snapshot().messages).toEqual(["doing ?"])
  })

  it("normalizes Ink control, enter, escape, and backspace inputs", () => {
    const source = readSource(cliInkSourcePath)

    expect(source).toContain("key.escape === true")
    expect(source).toContain("return \"escape\"")
    expect(source).toContain("key.return === true")
    expect(source).toContain("return \"enter\"")
    expect(source).toContain("key.backspace === true")
    expect(source).toContain("return \"C-h\"")
    expect(source).toContain("key.ctrl === true")
    expect(source).toContain("`C-${input.toLowerCase()}`")
  })

  it("normalizes terminal-kit named keys to shared game inputs", () => {
    const source = readSource(cliTerminalKitSourcePath)

    expect(source).toContain("name === \"ENTER\"")
    expect(source).toContain("name === \"ESCAPE\"")
    expect(source).toContain("name === \"SPACE\"")
    expect(source).toContain("/^CTRL_([A-Z])$/u")
    expect(source).toContain("`C-${ctrlMatch[1].toLowerCase()}`")
  })

  it("clears stale pickup contents and filters submitted popup keys", () => {
    const source = readSource(tuiControllerSourcePath)

    expect(source).toContain("this.pickupContents = emptyWorld()")
    expect(source).toContain("this.pickupRequestId += 1")
    expect(source).toContain("this.pickupRequestId !== pickupRequestId")
    expect(source).toContain(
      "const currentItemKeys = itemKeys(this.popupItems())"
    )
    expect(source).toContain("currentItemKeys.has(key)")
  })

  it("adds a Charmbracelet Bubble Tea frontend with the shared HTTP API controls", () => {
    const source = readSource(charmMainSourcePath)
    const goMod = readSource(charmGoModPath)

    expect(goMod).toContain("github.com/charmbracelet/bubbletea")
    expect(goMod).toContain("github.com/charmbracelet/lipgloss")
    expect(source).toContain("tea.NewProgram")
    expect(source).toContain("tea.WithAltScreen()")
    expect(source).toContain("FLAGHACK_API_URL")
    expect(source).toContain("http://127.0.0.1:3000")
    expect(source).toContain("parseMovementCommand")
    expect(source).toContain("runTravel")
    expect(source).toContain("pickupMulti")
    expect(source).toContain("dropMulti")
    expect(source).toContain("automove canceled")
  })
})
