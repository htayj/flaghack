import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  build: {
    target: "node21", // or whatever Node version you use
    ssr: true,
    outDir: "dist",
    rollupOptions: {
      input: "src/bin.ts",
      external: "@flaghack/domain/schemas"
    }
  }
})
