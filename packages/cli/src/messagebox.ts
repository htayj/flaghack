import blessed from "blessed"
import { List, Map } from "immutable"
// import { Box, Text } from "ink"
// import React from "react"
import { getOrElse } from "scala-ts/UndefOr.js"
import { identity } from "./util.js"

export const messagebox = (contents?: readonly string[]) => {
  const text = contents?.join(`\n`) ?? ""
  // const height = contents ? (contents?.length ?? 1) + 2 : 20
  return blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 30,
    label: "messages",
    content: text,
    style: {
      fg: "white",
      bg: "black",
      border: {
        fg: "blue"
      },
      hover: { bg: "green" }
    },
    border: {
      type: "line"
    }
  })
}
