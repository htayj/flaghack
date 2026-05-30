#!/usr/bin/env node
/* global console, process */

import { execFileSync } from "node:child_process"

const FORBIDDEN_PATTERNS = [
  {
    label: "package build output",
    pattern: /^packages\/[^/]+\/build\//
  },
  {
    label: "package dist output",
    pattern: /^packages\/[^/]+\/dist\//
  },
  {
    label: "generated TypeScript declaration",
    pattern: /(^|\/)[^/]+\.d\.ts$/u
  },
  {
    label: "generated TypeScript declaration map",
    pattern: /(^|\/)[^/]+\.d\.ts\.map$/u
  },
  {
    label: "generated JavaScript source map",
    pattern: /(^|\/)[^/]+\.js\.map$/u
  },
  {
    label: "editor backup file",
    pattern: /(^|\/)(?:#.*#|\.#.*|.*~)$/u
  },
  {
    label: "generated domain schema JavaScript",
    pattern: /^packages\/domain\/src\/schemas\/[^/]+\.js$/u
  },
  {
    label: "task graph runtime output",
    pattern: /^\.pi\/dev-suite\/task-graph\/(?:runs|artifacts|plans)\//u
  },
  {
    label: "task graph current pointer",
    pattern: /^\.pi\/dev-suite\/task-graph\/current\.json$/u
  },
  {
    label: "dev-suite edit tracker",
    pattern: /^\.pi\/dev-suite\/edited-files\.log$/u
  }
]

const normalizePath = (file) => file.replaceAll("\\", "/")

const runGit = (args) => {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`git ${args.join(" ")} failed: ${message}`)
  }
}

const lines = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

const changedFiles = new Set([
  ...lines(runGit(["diff", "--name-only"])),
  ...lines(runGit(["diff", "--cached", "--name-only"])),
  ...lines(runGit(["ls-files", "--others", "--exclude-standard"]))
].map(normalizePath))

const violations = [...changedFiles]
  .flatMap((file) =>
    FORBIDDEN_PATTERNS
      .filter(({ pattern }) => pattern.test(file))
      .map(({ label }) => ({ file, label }))
  )
  .sort((a, b) => a.file.localeCompare(b.file))

if (violations.length > 0) {
  console.error("Generated-file guardrail violation:")
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.label})`)
  }
  console.error("")
  console.error(
    "Do not edit generated artifacts directly. Change source/config files and "
      + "regenerate in an approved build/codegen step instead."
  )
  process.exit(1)
}

console.log("Generated-file guardrail passed.")
