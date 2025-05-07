import blessed from "blessed"
// import { Map } from "immutable"
// import { Box, Text } from "ink"
// import React from "react"
// import { getOrElse } from "scala-ts/UndefOr.js"
// import { identity } from "./util.js"
import { Tiles, tilesToText } from "./util.js"

// const identity = <T>(a: T) => a

// const colorEscMap = colorNumMap
// 	.map(fgColor)
// 	.merge(colorNumMap.mapKeys(s => 'bright_' + s).map(bfgColor))
// 	.merge(colorNumMap.mapKeys(s => 'bg_' + s).map(bgColor));
// const colorToEsc = (color?: string) => {
// 	switch (color) {
// 		case 'yellow':
// 			return `\x1b[33m`;
// 		case 'grey':
// 			return `\x1b[33m`;
// 	}
// };
// color === 'yellow' ? `\x1b[33m` : color === 'grey' ? `\x1b[90m` : `\x1b[37m`;

export const gameboard = (contents?: Tiles) => {
  const width = contents ? (contents[0]?.length ?? 1) + 2 : 80
  const height = contents ? (contents?.length ?? 1) + 2 : 20
  return blessed.box({
    bottom: 0,
    left: 0,
    width,
    height,
    label: "gameboard",
    content: contents ? tilesToText(contents) : "empty board",
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
// const tileToText = ({ color, char, bright, bg }: Tile) =>
//   `${ecolor(color, bright, bg)}${char}`
// export default function({ tiles }: Props) {
//   return (
//     <Box
//       borderStyle="round"
//       height={tiles.length + 2}
//       width={(tiles[0]?.length ?? 1) + 2}
//     >
//       <Text>
//         {tiles.map((row) => row.map(tileToText).join("")).join("\n")}
//       </Text>
//     </Box>
//   )
// }

// <Text>{tiles.map(row => row.map(tileToText).join('')).join('\n')}</Text>

// FIXME: why is this way of doing it slow?
// <Text>
// 	{tiles.map((row, i) => (
// 		<Text key={i}>{row.map(tileToText).join('')}</Text>
// 	))}
// </Text>
