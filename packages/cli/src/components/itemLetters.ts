import type { Key as KeySchema } from "@flaghack/domain/schemas"

export type Key = typeof KeySchema.Type
export type LetteredItem<
  T extends { readonly key: Key; readonly _tag: string }
> = {
  readonly letter: string | undefined
  readonly item: T
}

export const itemLetterAlphabet = "abcdefghijklmnopstuvwxyz" as const

export const sortItemsForLetters = <
  T extends { readonly key: Key; readonly _tag: string }
>(
  items: ReadonlyArray<T>
): ReadonlyArray<T> =>
  [...items].sort((left, right) => {
    const keyOrder = left.key.localeCompare(right.key)
    if (keyOrder !== 0) return keyOrder
    return left._tag.localeCompare(right._tag)
  })

export const assignItemLetters = <
  T extends { readonly key: Key; readonly _tag: string }
>(
  items: ReadonlyArray<T>
): ReadonlyArray<LetteredItem<T>> =>
  sortItemsForLetters(items).map((item, index) => ({
    letter: itemLetterAlphabet[index],
    item
  }))

const normalizedLetter = (input: string): string | undefined => {
  if (input.length !== 1) return undefined
  const letter = input.toLowerCase()
  return itemLetterAlphabet.includes(letter) ? letter : undefined
}

export const itemKeyForLetter = <
  T extends { readonly key: Key; readonly _tag: string }
>(
  items: ReadonlyArray<T>,
  input: string
): Key | undefined => {
  const letter = normalizedLetter(input)
  if (letter === undefined) return undefined
  return assignItemLetters(items).find((entry) => entry.letter === letter)
    ?.item.key
}

export const toggleLetterSelection = <
  T extends { readonly key: Key; readonly _tag: string }
>(
  items: ReadonlyArray<T>,
  selected: ReadonlySet<Key>,
  input: string
): ReadonlySet<Key> => {
  const key = itemKeyForLetter(items, input)
  if (key === undefined) return selected
  const next = new Set(selected)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  return next
}

export const itemLetterKeys = (): Array<string> =>
  itemLetterAlphabet.split("")

export const renderItemLabel = <
  T extends { readonly key: Key; readonly _tag: string }
>(
  entry: LetteredItem<T>
): string => `${entry.letter ?? "-"} - ${entry.item._tag}`
