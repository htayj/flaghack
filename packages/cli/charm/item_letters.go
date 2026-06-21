package main

import (
	"sort"
	"strings"
)

const itemLetterAlphabet = "abcdefghijklmnopstuvwxyz"

type letteredItem struct {
	letter string
	item   entity
}

func sortedItemsByKey(items []entity) []entity {
	sorted := make([]entity, len(items))
	copy(sorted, items)
	sort.SliceStable(sorted, func(i, j int) bool {
		left := sorted[i]
		right := sorted[j]
		if left.Key != right.Key {
			return left.Key < right.Key
		}
		if left.Tag != right.Tag {
			return left.Tag < right.Tag
		}
		return left.Name < right.Name
	})
	return sorted
}

func letteredItems(items []entity) []letteredItem {
	sorted := sortedItemsByKey(items)
	lettered := make([]letteredItem, 0, len(sorted))
	for i, item := range sorted {
		letter := ""
		if i < len(itemLetterAlphabet) {
			letter = string(itemLetterAlphabet[i])
		}
		lettered = append(lettered, letteredItem{letter: letter, item: item})
	}
	return lettered
}

func itemKeyForLetter(items []entity, input string) (string, bool) {
	letter := strings.ToLower(input)
	if len(letter) != 1 {
		return "", false
	}
	for _, entry := range letteredItems(items) {
		if entry.letter == letter {
			return entry.item.Key, true
		}
	}
	return "", false
}

func toggleMarkedItem(marked map[string]bool, key string) {
	if marked[key] {
		delete(marked, key)
		return
	}
	marked[key] = true
}
