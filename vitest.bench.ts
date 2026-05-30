import { defineConfig, mergeConfig } from "vitest/config"
import shared from "./vitest.shared.js"

const config = defineConfig({
  test: {
    benchmark: {
      include: ["packages/*/test/**/*.bench.ts"]
    }
  }
})

export default mergeConfig(shared, config)
