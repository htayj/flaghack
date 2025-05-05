#!/usr/bin/env node
import { render } from "ink"
import meow from "meow"
import React from "react"
import App from "./app.js"
import { GameClient } from "./GameClient.js"

const cli = meow(
  `
	Usage
	  $ flag-hack

	Options
		--name  Your name

	Examples
	  $ flag-hack --name=Jane
	  Hello, Jane
`,
  {
    importMeta: import.meta,
    flags: {
      name: {
        type: "string"
      }
    }
  }
)

export const startapp = () => render(<App opts={cli} />)
export type CliType = typeof cli
// render(<App opts={cli} />)
