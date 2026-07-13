package main

import "testing"

func TestLetteredItemsSortsByKeyAndSkipsReservedCancelLetters(t *testing.T) {
	items := []entity{
		{Key: "item-c", Tag: "salsa"},
		{Key: "item-a", Tag: "beer"},
		{Key: "item-b", Tag: "cheese"},
	}

	got := letteredItems(items)
	if len(got) != 3 {
		t.Fatalf("lettered item count = %d, want 3", len(got))
	}
	if got[0].letter != "a" || got[0].item.Key != "item-a" {
		t.Fatalf("first lettered item = %#v, want a/item-a", got[0])
	}
	if got[1].letter != "b" || got[1].item.Key != "item-b" {
		t.Fatalf("second lettered item = %#v, want b/item-b", got[1])
	}
	if got[2].letter != "c" || got[2].item.Key != "item-c" {
		t.Fatalf("third lettered item = %#v, want c/item-c", got[2])
	}

	for _, entry := range letteredItems(makeLetterTestItems(len(itemLetterAlphabet))) {
		if entry.letter == "q" || entry.letter == "r" {
			t.Fatalf("reserved cancel letter assigned: %#v", entry)
		}
	}
}

func TestItemKeyForLetterAndToggleMarkedItem(t *testing.T) {
	items := []entity{
		{Key: "item-b", Tag: "cheese"},
		{Key: "item-a", Tag: "beer"},
	}

	key, ok := itemKeyForLetter(items, "A")
	if !ok || key != "item-a" {
		t.Fatalf("itemKeyForLetter(A) = %q, %v; want item-a true", key, ok)
	}
	if _, ok := itemKeyForLetter(items, "q"); ok {
		t.Fatal("reserved q should not map to an item")
	}

	marked := map[string]bool{}
	toggleMarkedItem(marked, key)
	if !marked[key] {
		t.Fatalf("%s should be marked after first toggle", key)
	}
	toggleMarkedItem(marked, key)
	if marked[key] {
		t.Fatalf("%s should be unmarked after second toggle", key)
	}
}

func TestLetteredItemsLeavesOverflowUnassigned(t *testing.T) {
	items := makeLetterTestItems(len(itemLetterAlphabet) + 1)
	got := letteredItems(items)
	last := got[len(got)-1]
	if last.letter != "" {
		t.Fatalf("overflow letter = %q, want empty", last.letter)
	}
}

func TestLetteredItemsPageMakesOverflowReachable(t *testing.T) {
	items := makeLetterTestItems(30)
	entries, page, pageCount := letteredItemsPage(items, 3, 8)
	if page != 3 || pageCount != 4 || len(entries) != 6 {
		t.Fatalf("last page = page %d/%d entries %d, want page 3/4 entries 6", page, pageCount, len(entries))
	}
	if entries[0].letter != "a" || entries[0].item.Key != string(rune('a'+24)) {
		t.Fatalf("last page first entry = %#v", entries[0])
	}
	key, ok := itemKeyForLetterPage(items, "f", 3, 8)
	if !ok || key != string(rune('a'+29)) {
		t.Fatalf("last paged item = %q, %v; want final key", key, ok)
	}
	if _, ok := itemKeyForLetterPage(items, "g", 3, 8); ok {
		t.Fatal("letter beyond the final page should remain unassigned")
	}
}

func makeLetterTestItems(count int) []entity {
	items := make([]entity, 0, count)
	for i := 0; i < count; i++ {
		items = append(items, entity{Key: string(rune('a' + i)), Tag: "item"})
	}
	return items
}
