import { spawn } from "child_process"
import chokidar from "chokidar"

let child

function restart() {
  if (child) {
    child.kill("SIGTERM")
  }
  process.stdout.write("\x1Bc")
  child = spawn("pnpm", ["run", "play"], {
    stdio: "inherit"
  })
}

// Watch for source changes
chokidar.watch("./src").on("change", () => {
  restart()
})

restart()
