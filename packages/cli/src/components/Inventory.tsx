import { Entity } from "@flaghack/domain/schemas"
import { Map } from "immutable"
import { Box, Newline, Text } from "ink"
import React from "react"
// import { Entity } from "../world.js"

type Props = {
  inventory: Map<string, typeof Entity>
}

export default function Inventory({ inventory }: Props) {
  return (
    <Box overflow="hidden" borderStyle="round" height={22} width={15}>
      <Text>
        <Text underline>INVENTORY</Text>
        <Newline />
        {inventory.valueSeq().toArray().map((item, i) => (
          <Text key={i}>
            {item.name}
          </Text>
        ))}
      </Text>
    </Box>
  )
}
