package main

import (
	"encoding/json"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestParseMovementCommand(t *testing.T) {
	tests := []struct {
		input string
		tag   string
		dir   string
	}{
		{input: "h", tag: "walk", dir: "W"},
		{input: "L", tag: "run-to-block", dir: "E"},
		{input: "C-k", tag: "run", dir: "N"},
		{input: "g+n", tag: "rush", dir: "SE"},
		{input: "M+y", tag: "no-pickup-run", dir: "NW"},
	}

	for _, tc := range tests {
		got, ok := parseMovementCommand(tc.input)
		if !ok {
			t.Fatalf("parseMovementCommand(%q) returned none", tc.input)
		}
		if got.tag != tc.tag || got.dir != tc.dir {
			t.Fatalf("parseMovementCommand(%q) = %#v, want tag=%s dir=%s", tc.input, got, tc.tag, tc.dir)
		}
	}
}

func TestActionPayloadJSONMatchesEffectAPI(t *testing.T) {
	encoded, err := json.Marshal(actionPayload{Action: action{Tag: "move", Dir: "E"}})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"action":{"_tag":"move","dir":"E"}}`
	if string(encoded) != want {
		t.Fatalf("encoded action = %s, want %s", encoded, want)
	}

	emptyPickup, err := json.Marshal(actionPayload{Action: action{Tag: "pickupMulti", Keys: []string{}}})
	if err != nil {
		t.Fatal(err)
	}
	wantPickup := `{"action":{"_tag":"pickupMulti","keys":[]}}`
	if string(emptyPickup) != wantPickup {
		t.Fatalf("encoded pickup = %s, want %s", emptyPickup, wantPickup)
	}
}

func TestTileForCampgroundMarkers(t *testing.T) {
	tests := []struct {
		tag  string
		char string
	}{
		{tag: "tent", char: "^"},
		{tag: "sign", char: "?"},
		{tag: "effigy", char: "Y"},
		{tag: "temple", char: "Ω"},
		{tag: "cooler", char: "C"},
		{tag: "beer", char: "!"},
		{tag: "hotdog", char: "%"},
		{tag: "cheese", char: "%"},
		{tag: "salsa", char: "%"},
	}

	for _, tc := range tests {
		got := tileFor(entity{Tag: tc.tag})
		if got.char != tc.char {
			t.Fatalf("tileFor(%s) char = %q, want %q", tc.tag, got.char, tc.char)
		}
	}
}

func TestFindTravelDirectionsUsesKnownPassableTiles(t *testing.T) {
	world := []entity{
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "floor-2", Tag: "floor", In: "world", At: pos{X: 2, Y: 0, Z: 0}},
	}
	path := findTravelDirections(world, pos{X: 0, Y: 0, Z: 0}, pos{X: 2, Y: 0, Z: 0})
	if len(path) != 2 || path[0] != "E" || path[1] != "E" {
		t.Fatalf("path = %#v, want [E E]", path)
	}
}

func charmRuneKey(value rune) tea.KeyMsg {
	return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{value}}
}

func TestFindTravelDirectionsUsesCampgroundMarkerPassability(t *testing.T) {
	world := []entity{
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "sign-1", Tag: "sign", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "tent-2", Tag: "tent", In: "world", At: pos{X: 2, Y: 0, Z: 0}},
		{Key: "effigy-3", Tag: "effigy", In: "world", At: pos{X: 3, Y: 0, Z: 0}},
		{Key: "temple-4", Tag: "temple", In: "world", At: pos{X: 4, Y: 0, Z: 0}},
	}
	path := findTravelDirections(world, pos{X: 0, Y: 0, Z: 0}, pos{X: 4, Y: 0, Z: 0})
	if len(path) != 4 || path[0] != "E" || path[1] != "E" || path[2] != "E" || path[3] != "E" {
		t.Fatalf("path = %#v, want [E E E E]", path)
	}
}

func TestDescribeLookTargetListsCoordinatesAndVisibleContents(t *testing.T) {
	world := []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "sign-1", Tag: "sign", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Name: "Camp Type Safety"},
		{Key: "beer-1", Tag: "beer", In: "cooler-1", At: pos{X: 0, Y: 0, Z: 0}},
	}

	got := describeLookTarget(world, pos{X: 1, Y: 0, Z: 0})
	if !strings.Contains(got, "Look 1,0:") {
		t.Fatalf("look description missing coordinates: %q", got)
	}
	if !strings.Contains(got, "sign: Camp Type Safety") || !strings.Contains(got, "dusty ground") {
		t.Fatalf("look description missing visible tile contents: %q", got)
	}
	if strings.Contains(got, "beer") {
		t.Fatalf("look description should not expose contained cooler contents at another tile: %q", got)
	}
}

func TestLookModeMovesCursorAndEscapeExitsWithoutMovingPlayer(t *testing.T) {
	m := newModel()
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
		{Key: "cooler-1", Tag: "cooler", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
	}

	next, cmd := m.handleKey(charmRuneKey(';'))
	if cmd != nil {
		t.Fatalf("enter look returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.lookTarget == nil || *m.lookTarget != (pos{X: 0, Y: 0, Z: 0}) {
		t.Fatalf("initial look target = %#v, want player position", m.lookTarget)
	}

	next, cmd = m.handleKey(charmRuneKey('l'))
	if cmd != nil {
		t.Fatalf("look movement returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.lookTarget == nil || *m.lookTarget != (pos{X: 1, Y: 0, Z: 0}) {
		t.Fatalf("moved look target = %#v, want east tile", m.lookTarget)
	}
	if !strings.Contains(m.View(), "cooler") {
		t.Fatalf("look movement should describe target contents in event-log slot, view=%q", m.View())
	}
	player, ok := findPlayer(m.world)
	if !ok || player.At != (pos{X: 0, Y: 0, Z: 0}) {
		t.Fatalf("look movement should not move player, got %#v", player)
	}

	next, cmd = m.handleKey(tea.KeyMsg{Type: tea.KeyEsc})
	if cmd != nil {
		t.Fatalf("look escape returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.lookTarget != nil {
		t.Fatalf("look target after escape = %#v, want nil", m.lookTarget)
	}
}

func TestRenderMessagesHasFixedHeight(t *testing.T) {
	emptyLines := strings.Split(renderMessages([]string{}), "\n")
	manyLines := strings.Split(renderMessages([]string{
		"one",
		"two",
		"three",
		"four",
		"five",
		"six",
		"seven",
		"eight",
		"nine",
		"ten",
		"eleven",
	}), "\n")
	want := fixedEventAreaLines + 2
	if len(emptyLines) != want {
		t.Fatalf("empty message log lines = %d, want fixed height %d", len(emptyLines), want)
	}
	if len(manyLines) != want {
		t.Fatalf("full message log lines = %d, want fixed height %d", len(manyLines), want)
	}
}

func TestViewRendersLookDescriptionInEventLogSlot(t *testing.T) {
	m := newModel()
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
		{Key: "cooler-1", Tag: "cooler", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
	}
	lookTarget := pos{X: 1, Y: 0, Z: 0}
	m.lookTarget = &lookTarget

	view := m.View()
	lookIndex := strings.Index(view, "Look 1,0:")
	mapIndex := strings.Index(view, "@")
	statusIndex := strings.Index(view, "Player: you")
	if lookIndex < 0 || !strings.Contains(view, "cooler") || !strings.Contains(view, "Esc exits look mode") {
		t.Fatalf("look description missing from event-log slot: %q", view)
	}
	if !strings.Contains(view, "*") {
		t.Fatalf("look cursor highlight missing from view: %q", view)
	}
	if mapIndex < 0 || lookIndex > mapIndex {
		t.Fatalf("look description should replace event log above the map; look index %d, map index %d", lookIndex, mapIndex)
	}
	if statusIndex < 0 || mapIndex > statusIndex {
		t.Fatalf("status should remain below map; map index %d, status index %d", mapIndex, statusIndex)
	}
}

func TestViewRendersPickupInterfaceInInventorySlot(t *testing.T) {
	m := newModel()
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}
	m.inventory = []entity{{Key: "beer-1", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}}}
	m.popup = &popupState{
		kind:   popupPickup,
		title:  "Pickup what?",
		items:  []entity{{Key: "cooler-1", Tag: "cooler", In: "world", At: pos{X: 0, Y: 0, Z: 0}}},
		marked: map[string]bool{},
	}

	view := m.View()
	pickupIndex := strings.Index(view, "Pickup what?")
	mapIndex := strings.Index(view, "@")
	statusIndex := strings.Index(view, "Player: you")
	if pickupIndex < 0 || !strings.Contains(view, "cooler") {
		t.Fatalf("pickup interface missing from view: %q", view)
	}
	if mapIndex < 0 || pickupIndex < mapIndex || pickupIndex > statusIndex {
		t.Fatalf("pickup interface should render in the inventory/sidebar slot next to the map; pickup index %d, map index %d, status index %d", pickupIndex, mapIndex, statusIndex)
	}
	if strings.Contains(view, "inventory") || strings.Contains(view, "beer") {
		t.Fatalf("inventory sidebar should be replaced by pickup interface: %q", view)
	}
}

func TestViewKeepsDropInterfaceBelowStatus(t *testing.T) {
	m := newModel()
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}
	m.inventory = []entity{{Key: "beer-1", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}}}
	m.popup = &popupState{
		kind:   popupDrop,
		title:  "Drop what?",
		items:  []entity{{Key: "beer-1", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}}},
		marked: map[string]bool{},
	}

	view := m.View()
	inventoryIndex := strings.Index(view, "inventory")
	dropIndex := strings.Index(view, "Drop what?")
	statusIndex := strings.Index(view, "Player: you")
	if inventoryIndex < 0 || !strings.Contains(view, "beer") {
		t.Fatalf("drop popup should not replace inventory sidebar: %q", view)
	}
	if dropIndex < 0 {
		t.Fatalf("drop popup missing from view: %q", view)
	}
	if statusIndex < 0 || dropIndex < statusIndex {
		t.Fatalf("drop popup should remain below status; drop index %d, status index %d", dropIndex, statusIndex)
	}
}

func TestViewRendersEventLogAtTopAboveMap(t *testing.T) {
	m := newModel()
	m.messages = []string{"top event"}
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
	}

	view := m.View()
	eventIndex := strings.Index(view, "top event")
	mapIndex := strings.Index(view, "@")
	controlsIndex := strings.Index(view, "Flag Hack Charmbracelet UI")
	if eventIndex < 0 {
		t.Fatalf("event log message missing from view: %q", view)
	}
	if mapIndex < 0 {
		t.Fatalf("map player glyph missing from view: %q", view)
	}
	if controlsIndex < 0 {
		t.Fatalf("controls text missing from view: %q", view)
	}
	if eventIndex > mapIndex {
		t.Fatalf("event log should render above the map; message index %d, map index %d", eventIndex, mapIndex)
	}
	if eventIndex > controlsIndex {
		t.Fatalf("event log should be the top playing-screen section; message index %d, controls index %d", eventIndex, controlsIndex)
	}
}

func TestRenderStatusLabelsCampgroundAsBurn(t *testing.T) {
	status := renderStatus([]entity{{Key: "player", Tag: "player", In: "world", At: pos{X: 40, Y: 10, Z: 0}, Name: "Ada"}})
	if !strings.Contains(status, "Dlvl:burn") {
		t.Fatalf("campground status missing burn label: %q", status)
	}
	if strings.Contains(status, "Dlvl:1") {
		t.Fatalf("campground status should not be rendered as dungeon level 1: %q", status)
	}
}

func TestDrawWorldCentersPlayerOnLargeCampground(t *testing.T) {
	world := []entity{
		{Key: "floor-origin", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-corner", Tag: "floor", In: "world", At: pos{X: 139, Y: 47, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 100, Y: 30, Z: 0}},
	}

	tiles := drawWorld(world, nil)
	if got := tiles[boardHeight/2][boardWidth/2].char; got != "@" {
		t.Fatalf("center tile = %q, want player glyph", got)
	}
}

func TestTravelTargetUsesWorldCoordinatesOnLargeCampground(t *testing.T) {
	world := []entity{
		{Key: "floor-origin", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-corner", Tag: "floor", In: "world", At: pos{X: 119, Y: 47, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 60, Y: 24, Z: 0}},
	}

	if got := clampTravelTarget(pos{X: 60, Y: 24, Z: 0}, world); got != (pos{X: 60, Y: 24, Z: 0}) {
		t.Fatalf("initial travel target = %#v, want player world coordinate", got)
	}
	if got := clampTravelTarget(pos{X: 200, Y: 99, Z: 0}, world); got != (pos{X: 119, Y: 47, Z: 0}) {
		t.Fatalf("clamped travel target = %#v, want campground bounds", got)
	}
	if got := moveTravelTarget(pos{X: 119, Y: 47, Z: 0}, "SE", world); got != (pos{X: 119, Y: 47, Z: 0}) {
		t.Fatalf("moved travel target = %#v, want clamped campground bounds", got)
	}
}

func TestViewRendersStatusBoxBelowMapAboveControls(t *testing.T) {
	m := newModel()
	var player entity
	if err := json.Unmarshal([]byte(`{"key":"player","_tag":"player","in":"world","at":{"x":1,"y":0,"z":2},"name":"Ada"}`), &player); err != nil {
		t.Fatal(err)
	}
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		player,
	}

	view := m.View()
	mapIndex := strings.Index(view, "@")
	statusIndex := strings.Index(view, "Player: Ada")
	controlsIndex := strings.Index(view, "Flag Hack Charmbracelet UI")
	for label, index := range map[string]int{
		"map player glyph": mapIndex,
		"status box":       statusIndex,
		"controls":         controlsIndex,
	} {
		if index < 0 {
			t.Fatalf("%s missing from view: %q", label, view)
		}
	}
	for _, want := range []string{"St:--", "HP:--/--", "Dlvl:3"} {
		if !strings.Contains(view, want) {
			t.Fatalf("status box missing %q from view: %q", want, view)
		}
	}
	if mapIndex > statusIndex {
		t.Fatalf("status box should render below the map; map index %d, status index %d", mapIndex, statusIndex)
	}
	if statusIndex > controlsIndex {
		t.Fatalf("status box should render above controls; status index %d, controls index %d", statusIndex, controlsIndex)
	}
}

func TestDirectionalRunTurnsCornersAndStopsAtBoundaries(t *testing.T) {
	world := []entity{
		{Key: "player", Tag: "player", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "tunnel-0", Tag: "tunnel", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "tunnel-1", Tag: "tunnel", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "tunnel-2", Tag: "tunnel", In: "world", At: pos{X: 1, Y: 1, Z: 0}},
	}
	next := nextDirectionalRunDirection(moveCommand{tag: "run", dir: "E"}, "E", world, pos{X: 1, Y: 0, Z: 0}, pos{X: 0, Y: 0, Z: 0}, 0)
	if next.direction != "S" || next.turnAccumulator != 2 {
		t.Fatalf("next direction = %#v, want S with accumulator 2", next)
	}

	boundaryWorld := append(world, entity{Key: "room", Tag: "floor", In: "world", At: pos{X: 2, Y: 0, Z: 0}})
	if !shouldStopAtCorridorBoundary(moveCommand{tag: "run-to-block", dir: "E"}, "E", boundaryWorld, pos{X: 1, Y: 0, Z: 0}, ptr(pos{X: 0, Y: 0, Z: 0})) {
		t.Fatal("run-to-block should stop at a corridor boundary")
	}
}

func TestResolveBaseURL(t *testing.T) {
	if got := resolveBaseURL([]string{}); got != defaultBaseURL {
		t.Fatalf("default base URL = %q, want %q", got, defaultBaseURL)
	}
	if got := resolveBaseURL([]string{"FLAGHACK_API_URL= http://example.test/api/ "}); got != "http://example.test/api" {
		t.Fatalf("override base URL = %q", got)
	}
}

func ptr(value pos) *pos {
	return &value
}
