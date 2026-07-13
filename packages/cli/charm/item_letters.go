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

func itemPageCount(itemCount int, pageSize int) int {
	pageSize = max(1, min(pageSize, len(itemLetterAlphabet)))
	return max(1, (itemCount+pageSize-1)/pageSize)
}

func letteredItemsPage(
	items []entity,
	page int,
	pageSize int,
) ([]letteredItem, int, int) {
	pageSize = max(1, min(pageSize, len(itemLetterAlphabet)))
	sorted := sortedItemsByKey(items)
	pageCount := itemPageCount(len(sorted), pageSize)
	page = min(max(0, page), pageCount-1)
	start := min(len(sorted), page*pageSize)
	end := min(len(sorted), start+pageSize)
	lettered := make([]letteredItem, 0, end-start)
	for index, item := range sorted[start:end] {
		lettered = append(lettered, letteredItem{
			letter: string(itemLetterAlphabet[index]),
			item:   item,
		})
	}
	return lettered, page, pageCount
}

func itemKeyForLetter(items []entity, input string) (string, bool) {
	return itemKeyForLetterPage(
		items,
		input,
		0,
		len(itemLetterAlphabet),
	)
}

func itemKeyForLetterPage(
	items []entity,
	input string,
	page int,
	pageSize int,
) (string, bool) {
	letter := strings.ToLower(input)
	if len(letter) != 1 {
		return "", false
	}
	entries, _, _ := letteredItemsPage(items, page, pageSize)
	for _, entry := range entries {
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
