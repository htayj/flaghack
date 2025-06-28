import viteLogo from "/vite.svg"
import { useState } from "react"
import reactLogo from "./assets/react.svg"
import "./App.css"
import { BrowserHttpClient } from "@effect/platform-browser"
import { CreatureBase } from "@flaghack/domain/schemas"
import { Array, Effect, HashMap, Layer, pipe } from "effect"
import { GameClient, getWorld, MainLive } from "./GameClient.js"
import BPlaying from "./Playing.js"

const apiDoPlayerAction = pipe(
  GameClient.doPlayerAction
)
const apiGetInventory = GameClient.getInventory
const apiGetPickupItemsFor = GameClient.getPickupItemsFor
// const apiGetLogs = GameClient.getLogs
const apiGetWorld = GameClient.getWorld
// const App = () =>
//   Effect.runSync(Effect.gen(function*() {
//     const [count, setCount] = useState(0)

//     console.log(CreatureBase)
//     return Effect.succeed(
//       (
//         <>
//           <div>
//             <a href="https://vite.dev" target="_blank">
//               <img src={viteLogo} className="logo" alt="Vite logo" />
//             </a>
//             <a href="https://react.dev" target="_blank">
//               <img
//                 src={reactLogo}
//                 className="logo react"
//                 alt="React logo"
//               />
//             </a>
//           </div>
//           <h1>Vite + React</h1>
//           <div className="card">
//             <button onClick={() => setCount((count) => count + 1)}>
//               count is {count}
//             </button>
//             <p>
//               Edit <code>src/App.tsx</code> and save to test HMR
//             </p>
//           </div>
//           <p className="read-the-docs">
//             Click on the Vite and React logos to learn more
//           </p>
//         </>
//       )
//     )
//   }))
function App() {
  const [count, setCount] = useState(0)
  getWorld.pipe(
    Effect.andThen((r) => r.pipe(HashMap.entries)),
    Effect.andThen(Array.fromIterable),
    Effect.tap((rr) => console.log("world", rr)),
    Effect.runPromise
  )
  return <BPlaying username="ian" />
}

export default App
