package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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

func TestActionAndRefreshUsesClientStateForMovement(t *testing.T) {
	var inventoryRequests int
	var worldRequests int
	var clientStateRequests int
	var actRequests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/act":
			actRequests++
			w.WriteHeader(http.StatusOK)
		case "/client-state":
			clientStateRequests++
			_, _ = w.Write([]byte(`{"world":[["player",{"key":"player","_tag":"player","in":"world","at":{"x":1,"y":0,"z":0}}]],"inventory":[]}`))
		case "/world":
			worldRequests++
			_, _ = w.Write([]byte(`["unexpected"]`))
		case "/inventory":
			inventoryRequests++
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	got, err := client.actionAndRefresh(t.Context(), action{Tag: "move", Dir: "E"})
	if err != nil {
		t.Fatal(err)
	}

	if actRequests != 1 || clientStateRequests != 1 || worldRequests != 0 || inventoryRequests != 0 {
		t.Fatalf("requests act/client-state/world/inventory = %d/%d/%d/%d, want 1/1/0/0", actRequests, clientStateRequests, worldRequests, inventoryRequests)
	}
	if got.inventory == nil || len(got.inventory) != 0 {
		t.Fatalf("movement refresh inventory = %#v, want empty client-state inventory", got.inventory)
	}
	if len(got.world) != 1 || got.world[0].Key != "player" {
		t.Fatalf("movement world snapshot = %#v", got.world)
	}
}

func TestRunTravelBatchesStraightMovesAndDetectsBlockedTravelAtRefresh(t *testing.T) {
	playerX := 0
	actRequests := 0
	clientStateRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/act":
			actRequests++
			if actRequests == 1 {
				playerX++
			}
			w.WriteHeader(http.StatusOK)
		case "/client-state":
			clientStateRequests++
			_, _ = fmt.Fprintf(w, `{"world":[["floor-0",{"key":"floor-0","_tag":"floor","in":"world","at":{"x":0,"y":0,"z":0}}],["floor-1",{"key":"floor-1","_tag":"floor","in":"world","at":{"x":1,"y":0,"z":0}}],["floor-2",{"key":"floor-2","_tag":"floor","in":"world","at":{"x":2,"y":0,"z":0}}],["player",{"key":"player","_tag":"player","in":"world","at":{"x":%d,"y":0,"z":0},"name":"you"}]],"inventory":[["water-1",{"key":"water-1","_tag":"water","in":"player","at":{"x":0,"y":0,"z":0}}]]}`, playerX)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	initialWorld := []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "floor-2", Tag: "floor", In: "world", At: pos{X: 2, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}
	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	result, snap, err := client.runTravelUnmeasured(t.Context(), initialWorld, pos{X: 2, Y: 0, Z: 0}, make(chan struct{}))
	if err != nil {
		t.Fatal(err)
	}

	if result.kind != "blocked" || result.steps != 2 {
		t.Fatalf("travel result = %#v, want blocked after 2 steps", result)
	}
	if actRequests != 2 || clientStateRequests != 1 {
		t.Fatalf("requests act/client-state = %d/%d, want 2/1", actRequests, clientStateRequests)
	}
	player, ok := findPlayer(snap.world)
	if !ok || player.At != (pos{X: 1, Y: 0, Z: 0}) {
		t.Fatalf("final player = %#v, %v; want x=1", player, ok)
	}
	if len(snap.inventory) != 1 || snap.inventory[0].Key != "water-1" {
		t.Fatalf("final inventory = %#v, want client-state inventory", snap.inventory)
	}
}

func TestRunTravelRefreshesBeforeReturningCancelledBatch(t *testing.T) {
	playerX := 0
	actRequests := 0
	clientStateRequests := 0
	cancel := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/act":
			actRequests++
			playerX++
			if actRequests == 1 {
				close(cancel)
			}
			w.WriteHeader(http.StatusOK)
		case "/client-state":
			clientStateRequests++
			_, _ = fmt.Fprintf(w, `{"world":[["floor-0",{"key":"floor-0","_tag":"floor","in":"world","at":{"x":0,"y":0,"z":0}}],["floor-1",{"key":"floor-1","_tag":"floor","in":"world","at":{"x":1,"y":0,"z":0}}],["floor-2",{"key":"floor-2","_tag":"floor","in":"world","at":{"x":2,"y":0,"z":0}}],["player",{"key":"player","_tag":"player","in":"world","at":{"x":%d,"y":0,"z":0},"name":"you"}]],"inventory":[]}`, playerX)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	initialWorld := []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "floor-2", Tag: "floor", In: "world", At: pos{X: 2, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}
	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	result, snap, err := client.runTravelUnmeasured(t.Context(), initialWorld, pos{X: 2, Y: 0, Z: 0}, cancel)
	if err != nil {
		t.Fatal(err)
	}

	if result.kind != "cancelled" || result.steps != 1 {
		t.Fatalf("travel result = %#v, want cancelled after 1 step", result)
	}
	if actRequests != 1 || clientStateRequests != 1 {
		t.Fatalf("requests act/client-state = %d/%d, want 1/1", actRequests, clientStateRequests)
	}
	player, ok := findPlayer(snap.world)
	if !ok || player.At != (pos{X: 1, Y: 0, Z: 0}) {
		t.Fatalf("cancelled snapshot player = %#v, %v; want refreshed x=1", player, ok)
	}
}

func TestGetClientStateDecodesSetupRolesAndPlayerAttributes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/client-state" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"setup":{"phase":"confirm","selectedRoleId":"virgin"},"roles":[{"id":"virgin","letter":"v","name":"virgin","attributes":{"strength":10,"dexterity":10,"constitution":10,"intelligence":10,"wisdom":10,"charisma":10},"startingInventory":[],"equipment":[]}],"world":[["player",{"key":"player","_tag":"player","in":"world","at":{"x":1,"y":0,"z":0},"role":"virgin","attributes":{"strength":10,"dexterity":10,"constitution":10,"intelligence":10,"wisdom":10,"charisma":10}}]],"inventory":[]}`))
	}))
	defer server.Close()

	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	got, err := client.getClientState(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if got.setup.Phase != "confirm" || got.setup.SelectedRoleID != "virgin" {
		t.Fatalf("setup = %#v, want virgin confirmation", got.setup)
	}
	if len(got.roles) != 1 || got.roles[0].Letter != "v" || got.roles[0].Name != "virgin" {
		t.Fatalf("roles = %#v, want v - virgin", got.roles)
	}
	if len(got.world) != 1 || got.world[0].Attributes == nil || got.world[0].Attributes.Strength != 10 || got.world[0].Role != "virgin" {
		t.Fatalf("player role attributes = %#v", got.world)
	}
}

func TestSetupViewAndKeysSelectConfirmOrReturnToRoleSelection(t *testing.T) {
	m := newModel()
	m.setup = setupState{Phase: "selectRole"}
	m.roles = []role{{ID: "virgin", Letter: "v", Name: "virgin"}}

	if view := m.View(); !strings.Contains(view, "v - virgin") || strings.Contains(view, "Flag Hack Charmbracelet UI") {
		t.Fatalf("setup role view should show only the role picker, got %q", view)
	}

	next, cmd := m.handleKey(charmRuneKey('v'))
	if cmd == nil {
		t.Fatal("role letter should post setup role selection")
	}
	m = next.(model)
	if m.setup.Phase != "confirm" || m.setup.SelectedRoleID != "virgin" || !m.setupPending {
		t.Fatalf("setup after v = %#v pending=%v, want pending virgin confirmation", m.setup, m.setupPending)
	}
	if view := m.View(); !strings.Contains(view, "v - virgin") || !strings.Contains(view, "Working") || strings.Contains(view, "Is this ok? [yn]") {
		t.Fatalf("pending setup confirmation view should show role and working state only: %q", view)
	}

	next, cmd = m.handleKey(charmRuneKey('n'))
	if cmd != nil {
		t.Fatalf("n while role selection request is pending returned command %#v, want nil", cmd)
	}
	m = next.(model)

	next, _ = m.Update(setupDoneMsg{requestID: m.setupRequestID, snapshot: snapshot{setup: setupState{Phase: "confirm", SelectedRoleID: "virgin"}, roles: m.roles}})
	m = next.(model)
	if m.setupPending {
		t.Fatal("role selection response should clear setup pending")
	}
	if view := m.View(); !strings.Contains(view, "v - virgin") || !strings.Contains(view, "Is this ok? [yn]") || strings.Contains(view, "Working") {
		t.Fatalf("acknowledged setup confirmation view should show actionable y/n prompt: %q", view)
	}

	next, cmd = m.handleKey(charmRuneKey('n'))
	if cmd == nil {
		t.Fatal("n should post setup rejection after role selection is acknowledged")
	}
	m = next.(model)
	if m.setup.Phase != "selectRole" || m.setup.SelectedRoleID != "" || !m.setupPending {
		t.Fatalf("setup after n = %#v pending=%v, want pending role selection", m.setup, m.setupPending)
	}
}

func TestLoadingSetupScreenIgnoresNormalPlayKeys(t *testing.T) {
	m := newModel()

	if view := m.View(); !strings.Contains(view, "Loading game") || strings.Contains(view, "Flag Hack Charmbracelet UI") {
		t.Fatalf("initial empty model should render loading setup screen only: %q", view)
	}
	next, cmd := m.handleKey(charmRuneKey(','))
	if cmd != nil {
		t.Fatalf("loading setup key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup != nil || len(m.messages) != 0 {
		t.Fatalf("loading setup key should not open popups or messages, popup=%#v messages=%#v", m.popup, m.messages)
	}
}

func TestLoadingErrorStillIgnoresNormalPlayKeys(t *testing.T) {
	m := newModel()
	m.addMessage("initial load failed: boom")

	if view := m.View(); !strings.Contains(view, "Loading game") || !strings.Contains(view, "initial load failed") || strings.Contains(view, "Flag Hack Charmbracelet UI") {
		t.Fatalf("initial load failure should still render loading setup screen with errors: %q", view)
	}
	next, cmd := m.handleKey(charmRuneKey(','))
	if cmd != nil {
		t.Fatalf("loading error key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup != nil {
		t.Fatalf("loading error key should not open popups, popup=%#v", m.popup)
	}
}

func TestSetupIgnoresMovementUntilCompletionAndAppliesServerCompletion(t *testing.T) {
	m := newModel()
	m.setup = setupState{Phase: "selectRole"}
	m.roles = []role{{ID: "virgin", Letter: "v", Name: "virgin"}}
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}

	next, cmd := m.handleKey(charmRuneKey('l'))
	if cmd != nil {
		t.Fatalf("movement during setup returned command %#v, want nil", cmd)
	}
	m = next.(model)
	player, ok := findPlayer(m.world)
	if !ok || player.At != (pos{X: 0, Y: 0, Z: 0}) {
		t.Fatalf("movement during setup moved player to %#v", player)
	}

	m.setupRequestID = 7
	m.setupPending = true
	next, _ = m.Update(setupDoneMsg{requestID: 7, snapshot: snapshot{setup: setupState{Phase: "complete", SelectedRoleID: "virgin"}, roles: m.roles, world: m.world, inventory: []entity{}}})
	m = next.(model)
	if !m.setup.complete() {
		t.Fatalf("setup completion response did not enter normal play: %#v", m.setup)
	}
	if view := m.View(); !strings.Contains(view, "Flag Hack Charmbracelet UI") {
		t.Fatalf("complete setup should render normal play view: %q", view)
	}

	next, _ = m.Update(setupDoneMsg{requestID: 6, snapshot: snapshot{setup: setupState{Phase: "confirm", SelectedRoleID: "virgin"}, roles: m.roles, world: []entity{{Key: "stale-player", Tag: "player", In: "world", At: pos{X: 9, Y: 9, Z: 0}}}, inventory: []entity{}}})
	m = next.(model)
	if m.setup.Phase != "complete" {
		t.Fatalf("stale setup response regressed completed setup to %#v", m.setup)
	}
}

func TestDoorDirectionPromptDispatchesOpenAndCloseActions(t *testing.T) {
	m := newModel()
	m.setup = setupState{Phase: "complete"}
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "door-1", Tag: "door", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Variant: "vertical"},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}

	next, cmd := m.handleKey(charmRuneKey('o'))
	if cmd != nil {
		t.Fatalf("open key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.pendingDoorAction != "open" || !strings.Contains(m.messages[0], "Open direction") {
		t.Fatalf("open prompt state = %q messages=%#v", m.pendingDoorAction, m.messages)
	}

	next, cmd = m.handleKey(charmRuneKey('L'))
	if cmd != nil {
		t.Fatalf("shifted run direction in door prompt returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.pendingDoorAction != "" || !strings.Contains(m.messages[0], "canceled open") {
		t.Fatalf("shifted direction should cancel prompt, pending=%q messages=%#v", m.pendingDoorAction, m.messages)
	}

	next, cmd = m.handleKey(charmRuneKey('o'))
	if cmd != nil {
		t.Fatalf("open key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	next, cmd = m.handleKey(charmRuneKey('l'))
	if cmd == nil {
		t.Fatal("open direction should dispatch an open action")
	}
	m = next.(model)
	if m.pendingDoorAction != "" {
		t.Fatalf("pending door action after direction = %q, want cleared", m.pendingDoorAction)
	}

	next, cmd = m.handleKey(charmRuneKey('c'))
	if cmd != nil {
		t.Fatalf("close key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.pendingDoorAction != "close" || !strings.Contains(m.messages[0], "Close direction") {
		t.Fatalf("close prompt state = %q messages=%#v", m.pendingDoorAction, m.messages)
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

	lootTake, err := json.Marshal(actionPayload{Action: action{Tag: "lootTakeMulti", ContainerKey: "cooler-1", Keys: []string{"beer-1"}}})
	if err != nil {
		t.Fatal(err)
	}
	wantLootTake := `{"action":{"_tag":"lootTakeMulti","containerKey":"cooler-1","keys":["beer-1"]}}`
	if string(lootTake) != wantLootTake {
		t.Fatalf("encoded loot take = %s, want %s", lootTake, wantLootTake)
	}

	lootPut, err := json.Marshal(actionPayload{Action: action{Tag: "lootPutMulti", ContainerKey: "cooler-1", Keys: []string{"water-1"}}})
	if err != nil {
		t.Fatal(err)
	}
	wantLootPut := `{"action":{"_tag":"lootPutMulti","containerKey":"cooler-1","keys":["water-1"]}}`
	if string(lootPut) != wantLootPut {
		t.Fatalf("encoded loot put = %s, want %s", lootPut, wantLootPut)
	}

	eat, err := json.Marshal(actionPayload{Action: action{Tag: "eatMulti", Keys: []string{"hotdog-1"}}})
	if err != nil {
		t.Fatal(err)
	}
	wantEat := `{"action":{"_tag":"eatMulti","keys":["hotdog-1"]}}`
	if string(eat) != wantEat {
		t.Fatalf("encoded eat = %s, want %s", eat, wantEat)
	}

	quaff, err := json.Marshal(actionPayload{Action: action{Tag: "quaffMulti", Keys: []string{"beer-1"}}})
	if err != nil {
		t.Fatal(err)
	}
	wantQuaff := `{"action":{"_tag":"quaffMulti","keys":["beer-1"]}}`
	if string(quaff) != wantQuaff {
		t.Fatalf("encoded quaff = %s, want %s", quaff, wantQuaff)
	}

	open, err := json.Marshal(actionPayload{Action: action{Tag: "open", Dir: "E"}})
	if err != nil {
		t.Fatal(err)
	}
	wantOpen := `{"action":{"_tag":"open","dir":"E"}}`
	if string(open) != wantOpen {
		t.Fatalf("encoded open = %s, want %s", open, wantOpen)
	}
}

func TestTileForCampgroundMarkers(t *testing.T) {
	tests := []struct {
		tag     string
		char    string
		variant string
	}{
		{tag: "tent", char: "^"},
		{tag: "tent-wall", char: "│", variant: "vertical"},
		{tag: "tent-post", char: "┼"},
		{tag: "door", char: "│", variant: "vertical"},
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
		got := tileFor(entity{Tag: tc.tag, Variant: tc.variant})
		if got.char != tc.char {
			t.Fatalf("tileFor(%s) char = %q, want %q", tc.tag, got.char, tc.char)
		}
	}
}

func TestDrawWorldLayersFloorInsideTentsWallsItemsAndCreatures(t *testing.T) {
	floor := entity{Key: "floor", Tag: "floor", In: "world", At: pos{X: 1, Y: 2, Z: 0}}
	tent := entity{Key: "tent", Tag: "tent", In: "world", At: pos{X: 1, Y: 2, Z: 0}}
	wall := entity{Key: "wall", Tag: "wall", In: "world", At: pos{X: 1, Y: 2, Z: 0}, Variant: "vertical"}
	tentWall := entity{Key: "tent-wall", Tag: "tent-wall", In: "world", At: pos{X: 1, Y: 2, Z: 0}, Variant: "vertical"}
	tentPost := entity{Key: "tent-post", Tag: "tent-post", In: "world", At: pos{X: 1, Y: 2, Z: 0}}
	closedDoor := entity{Key: "door-closed", Tag: "door", In: "world", At: pos{X: 1, Y: 2, Z: 0}, Variant: "vertical"}
	openDoor := entity{Key: "door-open", Tag: "door", In: "world", At: pos{X: 1, Y: 2, Z: 0}, Variant: "vertical", Open: true}
	beer := entity{Key: "beer", Tag: "beer", In: "world", At: pos{X: 1, Y: 2, Z: 0}}
	player := entity{Key: "player", Tag: "player", In: "world", At: pos{X: 1, Y: 2, Z: 0}, Name: "you"}

	floorUnderTentWorlds := [][]entity{{floor, tent}, {tent, floor}}
	for _, world := range floorUnderTentWorlds {
		if got := drawWorld(world, nil)[2][1].char; got != "·" {
			t.Fatalf("floor/tent tile = %q, want ·", got)
		}
	}

	tentBlockerWorlds := []struct {
		world []entity
		want  string
	}{
		{world: []entity{tent, wall}, want: "│"},
		{world: []entity{wall, tent}, want: "│"},
		{world: []entity{tent, tentWall}, want: "│"},
		{world: []entity{tentWall, tent}, want: "│"},
		{world: []entity{tent, tentPost}, want: "┼"},
		{world: []entity{tentPost, tent}, want: "┼"},
	}
	for _, tc := range tentBlockerWorlds {
		if got := drawWorld(tc.world, nil)[2][1].char; got != tc.want {
			t.Fatalf("tent/blocker tile = %q, want %s", got, tc.want)
		}
	}
	if got := drawWorld([]entity{floor, closedDoor}, nil)[2][1].char; got != "│" {
		t.Fatalf("closed door tile = %q, want │", got)
	}
	if got := drawWorld([]entity{floor, openDoor}, nil)[2][1].char; got != "+" {
		t.Fatalf("open door tile = %q, want +", got)
	}

	if got := drawWorld([]entity{floor, tent, wall, tentWall, tentPost, beer}, nil)[2][1].char; got != "!" {
		t.Fatalf("item over terrain tile = %q, want !", got)
	}
	if got := drawWorld([]entity{floor, tent, wall, tentWall, tentPost, beer, player}, nil)[2][1].char; got != "@" {
		t.Fatalf("creature over item/terrain tile = %q, want @", got)
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

func TestFindTravelDirectionsTreatsClosedDoorsAndWallsOverPassableTilesAsBlocked(t *testing.T) {
	blockers := []entity{
		{Key: "wall-1", Tag: "wall", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "door-1", Tag: "door", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Variant: "vertical"},
		{Key: "tent-wall-1", Tag: "tent-wall", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Variant: "vertical"},
		{Key: "tent-post-1", Tag: "tent-post", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
	}
	for _, blocker := range blockers {
		world := []entity{
			{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
			{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
			{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
			blocker,
			{Key: "floor-2", Tag: "floor", In: "world", At: pos{X: 2, Y: 0, Z: 0}},
		}
		path := findTravelDirections(world, pos{X: 0, Y: 0, Z: 0}, pos{X: 2, Y: 0, Z: 0})
		if len(path) != 0 {
			t.Fatalf("path through %s = %#v, want no route", blocker.Tag, path)
		}
	}
}

func charmRuneKey(value rune) tea.KeyMsg {
	return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{value}}
}

func TestNormalizeBubbleTeaInputRecognizesAltLoot(t *testing.T) {
	got := normalizeBubbleTeaInput(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'l'}, Alt: true})
	if got != "M-l" {
		t.Fatalf("alt-l normalized to %q, want M-l", got)
	}
	if _, ok := parseMovementCommand("M-l"); ok {
		t.Fatal("Alt-l should not parse as a no-pickup run")
	}
	command, ok := parseMovementCommand("M+l")
	if !ok || command.tag != "no-pickup-run" || command.dir != "E" {
		t.Fatalf("M+l parsed as %#v, %v; want no-pickup-run east", command, ok)
	}
}

func TestSaveAndQuitControlKeysCallLifecycleEndpoints(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		switch r.URL.Path {
		case "/save", "/quit":
			w.WriteHeader(http.StatusOK)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	m := newModel()
	m.client = apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	m.setup = setupState{Phase: "complete"}
	m.world = []entity{{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}}}

	next, cmd := m.handleKey(tea.KeyMsg{Type: tea.KeyCtrlS})
	m = next.(model)
	if cmd == nil {
		t.Fatal("Ctrl-S should save and exit through a command")
	}
	if _, ok := cmd().(saveDoneMsg); !ok {
		t.Fatalf("Ctrl-S command returned unexpected message")
	}
	if len(paths) != 1 || paths[0] != "/save" {
		t.Fatalf("paths after save = %#v, want [/save]", paths)
	}

	if !m.pendingTerminalAction {
		t.Fatal("Ctrl-S should suppress gameplay while save is pending")
	}

	m = newModel()
	m.client = apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	m.setup = setupState{Phase: "complete"}
	m.world = []entity{{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}}}
	next, cmd = m.handleKey(tea.KeyMsg{Type: tea.KeyCtrlQ})
	m = next.(model)
	if cmd != nil || !m.pendingQuitConfirmation || !strings.Contains(m.messages[0], "save exits without quitting") {
		t.Fatalf("Ctrl-Q prompt state pending=%v cmd=%#v messages=%#v", m.pendingQuitConfirmation, cmd, m.messages)
	}

	next, cmd = m.handleKey(charmRuneKey('y'))
	m = next.(model)
	if cmd == nil {
		t.Fatal("confirming quit should call quit endpoint")
	}
	if _, ok := cmd().(quitDoneMsg); !ok {
		t.Fatalf("quit command returned unexpected message")
	}
	if m.pendingQuitConfirmation {
		t.Fatal("quit confirmation should clear after y")
	}
	if len(paths) != 2 || paths[1] != "/quit" {
		t.Fatalf("paths after quit = %#v, want second /quit", paths)
	}
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
		{Key: "tent-wall-1", Tag: "tent-wall", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Variant: "vertical"},
		{Key: "tent-post-1", Tag: "tent-post", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "sign-1", Tag: "sign", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Name: "Camp Type Safety"},
		{Key: "beer-1", Tag: "beer", In: "cooler-1", At: pos{X: 0, Y: 0, Z: 0}},
	}

	got := describeLookTarget(world, pos{X: 1, Y: 0, Z: 0})
	if !strings.Contains(got, "Look 1,0:") {
		t.Fatalf("look description missing coordinates: %q", got)
	}
	if !strings.Contains(got, "sign: Camp Type Safety") || !strings.Contains(got, "dusty ground") || !strings.Contains(got, "tent-wall") || !strings.Contains(got, "tent-post") {
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

func TestPopupLettersToggleVisibleItems(t *testing.T) {
	m := newModel()
	m.popup = &popupState{
		kind:  popupPickup,
		title: "Pickup what?",
		stage: popupStageItems,
		items: []entity{
			{Key: "item-b", Tag: "cheese", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
			{Key: "item-a", Tag: "beer", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		},
		marked: map[string]bool{},
	}

	next, cmd := m.handlePopupKey("a")
	if cmd != nil {
		t.Fatalf("letter toggle returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || !m.popup.marked["item-a"] || m.popup.marked["item-b"] {
		t.Fatalf("marked after a = %#v, want item-a only", m.popup)
	}
	if !strings.Contains(m.View(), "* a - beer") || !strings.Contains(m.View(), "  b - cheese") {
		t.Fatalf("pickup view should render marked letter rows: %q", m.View())
	}

	next, _ = m.handlePopupKey("a")
	m = next.(model)
	if m.popup == nil || m.popup.marked["item-a"] {
		t.Fatalf("marked after second a = %#v, want item-a unmarked", m.popup)
	}
}

func TestPopupLettersAllowLootActionLettersInItemStage(t *testing.T) {
	items := make([]entity, 0, 18)
	for i := 0; i < 18; i++ {
		items = append(items, entity{Key: fmt.Sprintf("item-%02d", i), Tag: fmt.Sprintf("tag-%02d", i)})
	}
	m := newModel()
	m.popup = &popupState{
		kind:         popupLoot,
		title:        "Loot cooler",
		containerKey: "cooler-1",
		mode:         lootTake,
		stage:        popupStageItems,
		items:        items,
		marked:       map[string]bool{},
	}
	pKey := letteredItems(items)[15].item.Key
	tKey := letteredItems(items)[17].item.Key

	next, cmd := m.handlePopupKey("p")
	if cmd != nil {
		t.Fatalf("p item letter returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || !m.popup.marked[pKey] {
		t.Fatalf("p item letter should mark %s, popup=%#v", pKey, m.popup)
	}

	next, cmd = m.handlePopupKey("t")
	if cmd != nil {
		t.Fatalf("t item letter returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || !m.popup.marked[tKey] {
		t.Fatalf("t item letter should mark %s, popup=%#v", tKey, m.popup)
	}
}

func TestRenderSidebarShowsStableInventoryLetters(t *testing.T) {
	got := renderSidebar([]entity{
		{Key: "water-1", Tag: "water", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "beer-1", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
	})

	if !strings.Contains(got, "a - beer") || !strings.Contains(got, "b - water") {
		t.Fatalf("inventory sidebar should show deterministic item letters: %q", got)
	}
}

func TestEatAndQuaffOpenFilteredInventoryPopups(t *testing.T) {
	m := newModel()
	m.inventory = []entity{
		{Key: "hotdog-1", Tag: "hotdog", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "beer-1", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "flag-1", Tag: "flag", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
	}

	next, cmd := m.handleKey(charmRuneKey('e'))
	if cmd != nil {
		t.Fatalf("eat key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || m.popup.kind != popupEat || m.popup.title != "Eat what?" {
		t.Fatalf("eat popup = %#v, want Eat what?", m.popup)
	}
	if len(m.popup.items) != 1 || m.popup.items[0].Key != "hotdog-1" {
		t.Fatalf("eat popup items = %#v, want only hotdog", m.popup.items)
	}

	next, cmd = m.handleKey(charmRuneKey('q'))
	if cmd == nil {
		// q cancels the active eat popup; press q again at top-level for quaff.
		m = next.(model)
		next, cmd = m.handleKey(charmRuneKey('q'))
	}
	if cmd != nil {
		t.Fatalf("quaff key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || m.popup.kind != popupQuaff || m.popup.title != "Quaff what?" {
		t.Fatalf("quaff popup = %#v, want Quaff what?", m.popup)
	}
	if len(m.popup.items) != 1 || m.popup.items[0].Key != "beer-1" {
		t.Fatalf("quaff popup items = %#v, want only beer", m.popup.items)
	}
}

func TestViewRendersLootInterfaceInInventorySlot(t *testing.T) {
	m := newModel()
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}
	m.inventory = []entity{{Key: "water-1", Tag: "water", In: "player", At: pos{X: 0, Y: 0, Z: 0}}}
	m.popup = &popupState{
		kind:         popupLoot,
		title:        "Loot cooler",
		containerKey: "cooler-1",
		mode:         lootTake,
		stage:        popupStageAction,
		items:        []entity{{Key: "beer-1", Tag: "beer", In: "cooler-1", At: pos{X: 0, Y: 0, Z: 0}}},
		putItems:     m.inventory,
		marked:       map[string]bool{},
	}

	view := m.View()
	lootIndex := strings.Index(view, "Loot cooler")
	mapIndex := strings.Index(view, "@")
	statusIndex := strings.Index(view, "Player: you")
	if lootIndex < 0 || !strings.Contains(view, "choose action") || !strings.Contains(view, "t - take") || !strings.Contains(view, "p - put") {
		t.Fatalf("loot action prompt missing from view: %q", view)
	}
	if strings.Contains(view, "beer") || strings.Contains(view, "water") {
		t.Fatalf("loot action prompt should not show item rows before action choice: %q", view)
	}
	if mapIndex < 0 || lootIndex < mapIndex || lootIndex > statusIndex {
		t.Fatalf("loot interface should render in the inventory/sidebar slot next to the map; loot index %d, map index %d, status index %d", lootIndex, mapIndex, statusIndex)
	}
	if strings.Contains(view, "inventory") || strings.Contains(view, "water") {
		t.Fatalf("inventory sidebar should be replaced by loot interface in take mode: %q", view)
	}
}

func TestStartingPickupInvalidatesPendingLootLoads(t *testing.T) {
	m := newModel()
	m.setup = setupState{Phase: "complete"}

	next, cmd := m.handleKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'l'}, Alt: true})
	if cmd == nil {
		t.Fatal("M-l should request loot containers")
	}
	m = next.(model)
	staleRequestID := m.lootRequestID

	next, cmd = m.handleKey(charmRuneKey(','))
	if cmd == nil {
		t.Fatal(", should request pickup items")
	}
	m = next.(model)
	if staleRequestID == m.lootRequestID {
		t.Fatalf("pickup should invalidate stale loot request %d", staleRequestID)
	}
	if m.popup == nil || m.popup.kind != popupPickup {
		t.Fatalf("popup after pickup = %#v, want pickup", m.popup)
	}

	next, _ = m.Update(lootContainersLoadedMsg{
		requestID:  staleRequestID,
		containers: []entity{{Key: "cooler-1", Tag: "cooler", In: "world", At: pos{X: 0, Y: 0, Z: 0}}},
	})
	m = next.(model)
	if m.popup == nil || m.popup.kind != popupPickup {
		t.Fatalf("stale loot response should not replace pickup popup, got %#v", m.popup)
	}
}

func TestMovementInvalidatesPendingLootLoads(t *testing.T) {
	m := newModel()
	m.world = []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}, Name: "you"},
	}

	next, cmd := m.handleKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'l'}, Alt: true})
	if cmd == nil {
		t.Fatal("M-l should request loot containers")
	}
	m = next.(model)
	staleRequestID := m.lootRequestID

	next, cmd = m.handleKey(charmRuneKey('l'))
	if cmd == nil {
		t.Fatal("movement should dispatch a move command")
	}
	m = next.(model)
	if staleRequestID == m.lootRequestID {
		t.Fatalf("movement should invalidate stale loot request %d", staleRequestID)
	}

	next, _ = m.Update(lootContainersLoadedMsg{
		requestID:  staleRequestID,
		containers: []entity{{Key: "cooler-1", Tag: "cooler", In: "world", At: pos{X: 0, Y: 0, Z: 0}}},
	})
	m = next.(model)
	if m.popup != nil {
		t.Fatalf("stale loot response should not open popup after movement, got %#v", m.popup)
	}
}

func TestLootPopupSwitchesBetweenTakeAndPutLists(t *testing.T) {
	m := newModel()
	m.popup = &popupState{
		kind:         popupLoot,
		title:        "Loot cooler",
		containerKey: "cooler-1",
		mode:         lootTake,
		stage:        popupStageAction,
		items:        []entity{{Key: "beer-1", Tag: "beer", In: "cooler-1", At: pos{X: 0, Y: 0, Z: 0}}},
		putItems:     []entity{{Key: "water-1", Tag: "water", In: "player", At: pos{X: 0, Y: 0, Z: 0}}},
		marked:       map[string]bool{},
	}

	next, cmd := m.handlePopupKey("p")
	if cmd != nil {
		t.Fatalf("loot mode switch returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || m.popup.mode != lootPut || m.popup.stage != popupStageItems {
		t.Fatalf("loot mode after p = %#v, want put item stage", m.popup)
	}
	if !strings.Contains(m.View(), "water") || strings.Contains(m.View(), "beer") {
		t.Fatalf("put mode should show inventory items only: %q", m.View())
	}

	m.popup.stage = popupStageAction
	next, cmd = m.handlePopupKey("t")
	if cmd != nil {
		t.Fatalf("loot mode switch returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.popup == nil || m.popup.mode != lootTake || m.popup.stage != popupStageItems {
		t.Fatalf("loot mode after t = %#v, want take item stage", m.popup)
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

func TestResolveDebugMessages(t *testing.T) {
	if resolveDebugMessages([]string{}, []string{}) {
		t.Fatal("debug messages should be disabled by default")
	}
	if !resolveDebugMessages([]string{"--debug-messages"}, []string{}) {
		t.Fatal("--debug-messages should enable debug messages")
	}
	if !resolveDebugMessages([]string{"--debug=true"}, []string{}) {
		t.Fatal("--debug=true should enable debug messages")
	}
	if !resolveDebugMessages([]string{}, []string{"FLAGHACK_DEBUG_MESSAGES=1"}) {
		t.Fatal("FLAGHACK_DEBUG_MESSAGES=1 should enable debug messages")
	}
	if resolveDebugMessages([]string{"--no-debug-messages"}, []string{"FLAGHACK_DEBUG_MESSAGES=1"}) {
		t.Fatal("--no-debug-messages should override the debug env flag")
	}
}

func TestHandleKeySuppressesDebugMessagesByDefault(t *testing.T) {
	m := newModelWithOptions(clientOptions{})
	m.setup = setupState{Phase: "complete"}
	next, cmd := m.handleKey(charmRuneKey('?'))
	if cmd != nil {
		t.Fatalf("unknown key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if len(m.messages) != 0 {
		t.Fatalf("messages = %#v, want no debug input messages by default", m.messages)
	}
}

func TestHandleKeyShowsDebugMessagesWhenEnabled(t *testing.T) {
	m := newModelWithOptions(clientOptions{debugMessages: true})
	m.setup = setupState{Phase: "complete"}
	next, cmd := m.handleKey(charmRuneKey('?'))
	if cmd != nil {
		t.Fatalf("unknown key returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if len(m.messages) != 1 || m.messages[0] != "doing ?" {
		t.Fatalf("messages = %#v, want doing debug message", m.messages)
	}
}

func ptr(value pos) *pos {
	return &value
}
