import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { UserConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

type VitestSourceTarget = "dist/dist/esm" | "src"
type VitestSourceTargetEnvironment = Readonly<
  Record<string, string | undefined>
>

export const getVitestSourceTarget = (
  env: VitestSourceTargetEnvironment = process.env
): VitestSourceTarget =>
  env.TEST_DIST !== undefined
    ? "dist/dist/esm"
    : "src"

export const packageAlias = (
  workspaceName: string,
  importName: string,
  sourceTarget = getVitestSourceTarget()
) => ({
  [`${importName}/test`]: path.join(
    rootDir,
    "packages",
    workspaceName,
    "test"
  ),
  [importName]: path.join(rootDir, "packages", workspaceName, sourceTarget)
})

const aliases = {
  ...packageAlias("cli", "cli"),
  ...packageAlias("cli", "@flaghack/cli"),
  ...packageAlias("domain", "domain"),
  ...packageAlias("domain", "@flaghack/domain"),
  ...packageAlias("server", "server"),
  ...packageAlias("server", "@flaghack/server"),
  ...packageAlias("web", "web"),
  ...packageAlias("web", "@flaghack/web")
}

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config: UserConfig = {
  esbuild: {
    target: "es2020"
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"]
  },
  test: {
    setupFiles: [path.join(rootDir, "setupTests.ts")],
    fakeTimers: {
      toFake: undefined
    },
    sequence: {
      concurrent: true
    },
    include: ["test/**/*.test.ts"],
    alias: aliases
  }
}

export default config
