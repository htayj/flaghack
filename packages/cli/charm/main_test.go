package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func TestActionCmdUsesStreamWithoutClientStateRefreshWhenActive(t *testing.T) {
	var clientStateRequests int
	var actRequests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/act":
			actRequests++
			w.WriteHeader(http.StatusOK)
		case "/client-state":
			clientStateRequests++
			_, _ = w.Write([]byte(`{"world":[],"inventory":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	msg := actionCmd(client, action{Tag: "move", Dir: "E"}, true)().(actionDoneMsg)
	if msg.err != nil {
		t.Fatal(msg.err)
	}
	if !msg.streamed {
		t.Fatal("streaming action command should return a streamed action message")
	}
	if actRequests != 1 || clientStateRequests != 0 {
		t.Fatalf("requests act/client-state = %d/%d, want 1/0", actRequests, clientStateRequests)
	}
}

func streamClientStateEvent(revision int, playerX int) string {
	return fmt.Sprintf("id: %d\nevent: client-state\ndata: {\"revision\":%d,\"source\":\"action\",\"clientState\":{\"world\":[[\"floor-0\",{\"key\":\"floor-0\",\"_tag\":\"floor\",\"in\":\"world\",\"at\":{\"x\":0,\"y\":0,\"z\":0}}],[\"floor-1\",{\"key\":\"floor-1\",\"_tag\":\"floor\",\"in\":\"world\",\"at\":{\"x\":1,\"y\":0,\"z\":0}}],[\"player\",{\"key\":\"player\",\"_tag\":\"player\",\"in\":\"world\",\"at\":{\"x\":%d,\"y\":0,\"z\":0}}]],\"inventory\":[],\"roles\":[],\"setup\":{\"phase\":\"complete\"}}}\n\n", revision, revision, playerX)
}

func landmarkClientStateJSON(playerX int, currentAddress string, eventID int, interruptsTravel ...bool) string {
	addressField := ""
	if currentAddress != "" {
		addressField = fmt.Sprintf(`"currentAddress":%q,`, currentAddress)
	}
	events := "[]"
	if eventID > 0 {
		interruptField := ""
		if len(interruptsTravel) > 0 {
			interruptField = fmt.Sprintf(`,"interruptsTravel":%t`, interruptsTravel[0])
		}
		events = fmt.Sprintf(`[{"id":%d,"message":"A ranger calls for your attention."%s}]`, eventID, interruptField)
	}
	return fmt.Sprintf(`{
		"world":[
			["floor",{"key":"floor","_tag":"floor","in":"world","at":{"x":%d,"y":0,"z":0}}],
			["player",{"key":"player","_tag":"player","in":"world","at":{"x":%d,"y":0,"z":0}}]
		],
		"inventory":[],
		"roles":[],
		"setup":{"phase":"complete"},
		"gameplayEvents":%s,
		"campground":{%s"discoveredLandmarks":[{
			"id":"temple","name":"The Temple","kind":"temple",
			"at":{"x":2,"y":0,"z":0},"address":"Temple Road","travelAvailable":true
		}]}
	}`, playerX, playerX, events, addressField)
}

func landmarkStreamEvent(revision int, playerX int, currentAddress string, eventID int, interruptsTravel ...bool) string {
	var compact bytes.Buffer
	if err := json.Compact(
		&compact,
		[]byte(landmarkClientStateJSON(playerX, currentAddress, eventID, interruptsTravel...)),
	); err != nil {
		panic(err)
	}
	return fmt.Sprintf(
		"id: %d\nevent: client-state\ndata: {\"revision\":%d,\"source\":\"action\",\"clientState\":%s}\n\n",
		revision,
		revision,
		compact.String(),
	)
}

func initialLandmarkTravelSnapshot() snapshot {
	campground := campgroundView{DiscoveredLandmarks: []campgroundLandmark{{
		ID: "temple", Name: "The Temple", Kind: "temple",
		At: pos{X: 2, Y: 0, Z: 0}, Address: "Temple Road", TravelAvailable: true,
	}}}
	return snapshot{
		world: []entity{
			{Key: "floor", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
			{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		},
		campground: &campground,
	}
}

func TestReadClientStateSSEParsesRevisionedSnapshots(t *testing.T) {
	events := make(chan clientStateStreamResult, 1)
	readClientStateSSE(
		t.Context(),
		strings.NewReader("id: 1\nevent: client-state\ndata: {\"revision\":1,\"source\":\"action\",\"clientState\":{\"world\":[[\"player\",{\"key\":\"player\",\"_tag\":\"player\",\"in\":\"world\",\"at\":{\"x\":1,\"y\":0,\"z\":0}}]],\"inventory\":[],\"roles\":[],\"setup\":{\"phase\":\"complete\"},\"gameplayEvents\":[{\"id\":7,\"message\":\"You hear distant laughter.\",\"interruptsTravel\":false}]}}\n\n"),
		events,
	)
	result, ok := <-events
	if !ok {
		t.Fatal("SSE parser did not emit an event")
	}
	if result.err != nil {
		t.Fatal(result.err)
	}
	if result.event.Revision != 1 || result.event.Source != "action" {
		t.Fatalf("event = %#v, want revision 1 action", result.event)
	}
	snap, err := result.event.snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(snap.world) != 1 || snap.world[0].Key != "player" {
		t.Fatalf("snapshot world = %#v", snap.world)
	}
	if len(snap.gameplayEvents) != 1 || snap.gameplayEvents[0].ID != 7 || snap.gameplayEvents[0].Message != "You hear distant laughter." {
		t.Fatalf("snapshot gameplay events = %#v", snap.gameplayEvents)
	}
	if snap.gameplayEvents[0].InterruptsTravel == nil || *snap.gameplayEvents[0].InterruptsTravel {
		t.Fatalf("snapshot ambient event lost explicit noninterrupting flag: %#v", snap.gameplayEvents)
	}
}

func TestApplySnapshotAddsGameplayEventsOnlyOnce(t *testing.T) {
	ambient := false
	m := newModel()
	firstSnapshot := snapshot{gameplayEvents: []gameplayEvent{
		{ID: 1, Message: "You hear hippies grumbling in the tunnels.", InterruptsTravel: &ambient},
		{ID: 2, Message: "The hippie asks about a missing flag."},
	}}

	m.applySnapshot(firstSnapshot)
	m.applySnapshot(firstSnapshot)
	m.applySnapshot(snapshot{gameplayEvents: []gameplayEvent{
		{ID: 1, Message: "You hear hippies grumbling in the tunnels."},
		{ID: 2, Message: "The hippie asks about a missing flag."},
		{ID: 3, Message: "You hear hippies laughing somewhere in the tunnels."},
	}})

	want := []string{
		"You hear hippies laughing somewhere in the tunnels.",
		"The hippie asks about a missing flag.",
		"You hear hippies grumbling in the tunnels.",
	}
	if len(m.messages) != len(want) {
		t.Fatalf("messages = %#v, want %#v", m.messages, want)
	}
	for index := range want {
		if m.messages[index] != want[index] {
			t.Fatalf("messages = %#v, want %#v", m.messages, want)
		}
	}
	if m.lastGameplayEventID != 3 {
		t.Fatalf("last gameplay event ID = %d, want 3", m.lastGameplayEventID)
	}
}

func TestGameplayEventTravelInterruptionUsesPresenceSemantics(t *testing.T) {
	interrupts := true
	doesNotInterrupt := false
	tests := []struct {
		name     string
		events   []gameplayEvent
		baseline int
		want     bool
	}{
		{
			name:     "newer explicit false remains ambient",
			events:   []gameplayEvent{{ID: 8, Message: "distant laughter", InterruptsTravel: &doesNotInterrupt}},
			baseline: 7,
		},
		{
			name:     "newer omitted flag preserves legacy interruption",
			events:   []gameplayEvent{{ID: 8, Message: "a ranger calls"}},
			baseline: 7,
			want:     true,
		},
		{
			name:     "newer explicit true interrupts",
			events:   []gameplayEvent{{ID: 8, Message: "a ranger calls", InterruptsTravel: &interrupts}},
			baseline: 7,
			want:     true,
		},
		{
			name:     "interrupting event at baseline is not new",
			events:   []gameplayEvent{{ID: 7, Message: "already seen"}},
			baseline: 7,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := hasNewInterruptingGameplayEvent(test.events, test.baseline); got != test.want {
				t.Fatalf("hasNewInterruptingGameplayEvent() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestClientStateSnapshotDecodesAndStoresCampgroundView(t *testing.T) {
	var raw clientStateResponse
	err := json.Unmarshal([]byte(`{
		"world":[],
		"inventory":[],
		"roles":[],
		"setup":{"phase":"complete"},
		"gameplayEvents":[],
		"campground":{
			"currentAddress":"N-1, Lantern Road",
			"weather":{"condition":"heavy-rain"},
			"discoveredLandmarks":[{
				"id":"arrival-plaza",
				"name":"Arrival Plaza",
				"kind":"civic",
				"at":{"x":96,"y":120,"z":0},
				"address":"Gate and Main Road",
				"travelAvailable":true
			}],
			"activeEvent":{
				"kind":"meal",
				"name":"Pancake Breakfast",
				"landmarkId":"dusty-spoon",
				"hostCampId":"dusty-spoon",
				"endTurn":80
			}
		}
	}`), &raw)
	if err != nil {
		t.Fatal(err)
	}
	snap, err := raw.snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if snap.campground == nil || len(snap.campground.DiscoveredLandmarks) != 1 {
		t.Fatalf("snapshot campground = %#v", snap.campground)
	}

	m := newModel()
	m.applySnapshot(snap)
	if m.campground.CurrentAddress != "N-1, Lantern Road" {
		t.Fatalf("model campground = %#v", m.campground)
	}
	if m.campground.ActiveEvent == nil || m.campground.ActiveEvent.Name != "Pancake Breakfast" {
		t.Fatalf("model active event = %#v", m.campground.ActiveEvent)
	}
	if m.campground.Weather == nil || m.campground.Weather.Condition != "heavy-rain" {
		t.Fatalf("model campground weather = %#v", m.campground.Weather)
	}
}

func TestStreamedRepeatedMovementDoesNotFetchClientStatePerStep(t *testing.T) {
	positions := make(chan int, 4)
	streamRequests := 0
	clientStateRequests := 0
	actRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/act":
			actRequests++
			if actRequests == 1 {
				positions <- 1
			} else {
				positions <- 1
			}
			w.WriteHeader(http.StatusOK)
		case "/client-state/stream":
			streamRequests++
			w.Header().Set("Content-Type", "text/event-stream")
			flusher, ok := w.(http.Flusher)
			if !ok {
				t.Fatal("response writer does not flush")
			}
			_, _ = w.Write([]byte(streamClientStateEvent(0, 0)))
			flusher.Flush()
			revision := 0
			for revision < 2 {
				select {
				case x := <-positions:
					revision++
					_, _ = w.Write([]byte(streamClientStateEvent(revision, x)))
					flusher.Flush()
				case <-r.Context().Done():
					return
				case <-time.After(2 * time.Second):
					return
				}
			}
		case "/client-state":
			clientStateRequests++
			_, _ = w.Write([]byte(`{"world":[],"inventory":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	initialWorld := []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
	}
	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	result, snap, err := client.runDirectionalMovementStreamedUnmeasured(t.Context(), initialWorld, moveCommand{tag: "run-to-block", dir: "E"}, make(chan struct{}))
	if err != nil {
		t.Fatal(err)
	}

	if result.kind != "blocked" || result.steps != 1 {
		t.Fatalf("streamed run result = %#v, want blocked after 1 step", result)
	}
	if actRequests != 2 || streamRequests != 1 || clientStateRequests != 0 {
		t.Fatalf("requests act/stream/client-state = %d/%d/%d, want 2/1/0", actRequests, streamRequests, clientStateRequests)
	}
	player, ok := findPlayer(snap.world)
	if !ok || player.At != (pos{X: 1, Y: 0, Z: 0}) {
		t.Fatalf("streamed run player = %#v, %v; want x=1", player, ok)
	}
}

func TestStreamedRepeatedMovementDoesNotPollWhenStreamOpenFails(t *testing.T) {
	clientStateRequests := 0
	actRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/act":
			actRequests++
			w.WriteHeader(http.StatusOK)
		case "/client-state/stream":
			http.Error(w, "stream unavailable", http.StatusServiceUnavailable)
		case "/client-state":
			clientStateRequests++
			_, _ = w.Write([]byte(`{"world":[],"inventory":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
	result, _, err := client.runDirectionalMovementStreamedUnmeasured(t.Context(), []entity{{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}}}, moveCommand{tag: "run-to-block", dir: "E"}, make(chan struct{}))

	if err == nil {
		t.Fatal("streamed run should fail instead of falling back to polling when stream open fails")
	}
	if result.kind != "error" || result.steps != 0 {
		t.Fatalf("result = %#v, want immediate error", result)
	}
	if actRequests != 0 || clientStateRequests != 0 {
		t.Fatalf("requests act/client-state = %d/%d, want 0/0", actRequests, clientStateRequests)
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

func TestLandmarkTravelPollingRepeatsAuthoritativeStepsAndStops(t *testing.T) {
	t.Run("arrival", func(t *testing.T) {
		actRequests := 0
		clientStateRequests := 0
		payloads := []string{}
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/act":
				actRequests++
				body := new(strings.Builder)
				_, _ = io.Copy(body, r.Body)
				payloads = append(payloads, body.String())
				w.WriteHeader(http.StatusOK)
			case "/client-state":
				clientStateRequests++
				address := ""
				if actRequests >= 2 {
					address = "Temple Road"
				}
				_, _ = w.Write([]byte(landmarkClientStateJSON(min(actRequests, 2), address, 0)))
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
		result, snap, err := client.runLandmarkTravelPolling(
			t.Context(), initialLandmarkTravelSnapshot(), "temple", 0, make(chan struct{}),
		)
		if err != nil {
			t.Fatal(err)
		}
		if result.kind != "arrived" || result.steps != 2 {
			t.Fatalf("landmark travel result = %#v, want arrival after two steps", result)
		}
		if actRequests != 2 || clientStateRequests != 2 {
			t.Fatalf("requests act/client-state = %d/%d, want 2/2", actRequests, clientStateRequests)
		}
		for _, payload := range payloads {
			if !strings.Contains(payload, `"_tag":"travelStep"`) || !strings.Contains(payload, `"landmarkId":"temple"`) {
				t.Fatalf("travel step payload = %q", payload)
			}
		}
		player, ok := findPlayer(snap.world)
		if !ok || player.At.X != 2 {
			t.Fatalf("arrived player = %#v, %v", player, ok)
		}
	})

	t.Run("important event", func(t *testing.T) {
		actRequests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/act":
				actRequests++
				w.WriteHeader(http.StatusOK)
			case "/client-state":
				_, _ = w.Write([]byte(landmarkClientStateJSON(1, "", 8)))
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
		result, snap, err := client.runLandmarkTravelPolling(
			t.Context(), initialLandmarkTravelSnapshot(), "temple", 7, make(chan struct{}),
		)
		if err != nil {
			t.Fatal(err)
		}
		if result.kind != "interesting" || result.steps != 1 || actRequests != 1 {
			t.Fatalf("event-interrupted landmark travel = %#v requests=%d", result, actRequests)
		}
		if maxGameplayEventID(snap.gameplayEvents) != 8 {
			t.Fatalf("interruption snapshot events = %#v", snap.gameplayEvents)
		}
	})

	t.Run("ambient event", func(t *testing.T) {
		actRequests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/act":
				actRequests++
				w.WriteHeader(http.StatusOK)
			case "/client-state":
				address := ""
				if actRequests >= 2 {
					address = "Temple Road"
				}
				_, _ = w.Write([]byte(landmarkClientStateJSON(min(actRequests, 2), address, 8, false)))
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
		result, snap, err := client.runLandmarkTravelPolling(
			t.Context(), initialLandmarkTravelSnapshot(), "temple", 7, make(chan struct{}),
		)
		if err != nil {
			t.Fatal(err)
		}
		if result.kind != "arrived" || result.steps != 2 || actRequests != 2 {
			t.Fatalf("ambient-event landmark travel = %#v requests=%d", result, actRequests)
		}
		if maxGameplayEventID(snap.gameplayEvents) != 8 || hasNewInterruptingGameplayEvent(snap.gameplayEvents, 7) {
			t.Fatalf("ambient event not preserved as visible/noninterrupting: %#v", snap.gameplayEvents)
		}
	})
}

func TestLandmarkTravelUsesSSEAndFallsBackBeforeFirstStep(t *testing.T) {
	t.Run("SSE", func(t *testing.T) {
		positions := make(chan int, 2)
		actRequests := 0
		streamRequests := 0
		clientStateRequests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/act":
				actRequests++
				positions <- actRequests
				w.WriteHeader(http.StatusOK)
			case "/client-state/stream":
				streamRequests++
				w.Header().Set("Content-Type", "text/event-stream")
				flusher := w.(http.Flusher)
				_, _ = w.Write([]byte(landmarkStreamEvent(0, 0, "", 0)))
				flusher.Flush()
				for revision := 1; revision <= 2; revision++ {
					select {
					case x := <-positions:
						address := ""
						if x == 2 {
							address = "Temple Road"
						}
						_, _ = w.Write([]byte(landmarkStreamEvent(revision, x, address, 8, false)))
						flusher.Flush()
					case <-r.Context().Done():
						return
					}
				}
			case "/client-state":
				clientStateRequests++
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
		result, snap, err := client.runLandmarkTravel(
			t.Context(), initialLandmarkTravelSnapshot(), "temple", 0, make(chan struct{}), true,
		)
		if err != nil {
			t.Fatal(err)
		}
		if result.kind != "arrived" || result.steps != 2 {
			t.Fatalf("streamed landmark result = %#v", result)
		}
		if maxGameplayEventID(snap.gameplayEvents) != 8 || hasNewInterruptingGameplayEvent(snap.gameplayEvents, 0) {
			t.Fatalf("streamed ambient event not preserved as visible/noninterrupting: %#v", snap.gameplayEvents)
		}
		if actRequests != 2 || streamRequests != 1 || clientStateRequests != 0 {
			t.Fatalf("requests act/stream/client-state = %d/%d/%d", actRequests, streamRequests, clientStateRequests)
		}
	})

	t.Run("HTTP fallback", func(t *testing.T) {
		actRequests := 0
		streamRequests := 0
		clientStateRequests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.URL.Path {
			case "/client-state/stream":
				streamRequests++
				http.Error(w, "stream unavailable", http.StatusServiceUnavailable)
			case "/act":
				actRequests++
				w.WriteHeader(http.StatusOK)
			case "/client-state":
				clientStateRequests++
				address := ""
				if actRequests >= 2 {
					address = "Temple Road"
				}
				_, _ = w.Write([]byte(landmarkClientStateJSON(min(actRequests, 2), address, 0)))
			default:
				http.NotFound(w, r)
			}
		}))
		defer server.Close()

		client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
		result, _, err := client.runLandmarkTravel(
			t.Context(), initialLandmarkTravelSnapshot(), "temple", 0, make(chan struct{}), true,
		)
		if err != nil {
			t.Fatal(err)
		}
		if result.kind != "arrived" || result.steps != 2 {
			t.Fatalf("fallback landmark result = %#v", result)
		}
		if streamRequests != 1 || actRequests != 2 || clientStateRequests != 2 {
			t.Fatalf("fallback requests stream/act/client-state = %d/%d/%d", streamRequests, actRequests, clientStateRequests)
		}
	})
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

func TestCoordinateTravelOnlyStopsForNewInterruptingEvents(t *testing.T) {
	tests := []struct {
		name             string
		interruptsTravel []bool
		wantKind         string
	}{
		{
			name:             "explicit false remains ambient",
			interruptsTravel: []bool{false},
			wantKind:         "arrived",
		},
		{
			name:     "omitted flag interrupts for legacy events",
			wantKind: "interesting",
		},
		{
			name:             "explicit true interrupts",
			interruptsTravel: []bool{true},
			wantKind:         "interesting",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actRequests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/act":
					actRequests++
					w.WriteHeader(http.StatusOK)
				case "/client-state":
					_, _ = w.Write([]byte(landmarkClientStateJSON(1, "", 8, test.interruptsTravel...)))
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()

			initialWorld := []entity{
				{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "floor-1", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
				{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
			}
			client := apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
			result, snap, err := client.runTravelUnmeasuredFromBaseline(
				t.Context(), initialWorld, pos{X: 1, Y: 0, Z: 0}, 7, make(chan struct{}),
			)
			if err != nil {
				t.Fatal(err)
			}
			if result.kind != test.wantKind || result.steps != 1 || actRequests != 1 {
				t.Fatalf("coordinate travel = %#v requests=%d, want kind %q after one step", result, actRequests, test.wantKind)
			}
			if maxGameplayEventID(snap.gameplayEvents) != 8 {
				t.Fatalf("coordinate travel dropped gameplay event: %#v", snap.gameplayEvents)
			}
		})
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

func TestTalkDirectionPromptDispatchesDirectionalAction(t *testing.T) {
	m := newModel()
	m.setup = setupState{Phase: "complete"}
	m.world = []entity{{
		Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0},
	}}

	next, cmd := m.handleKey(charmRuneKey('t'))
	if cmd != nil {
		t.Fatalf("talk key returned command %#v, want prompt", cmd)
	}
	m = next.(model)
	if !m.pendingTalk || !strings.Contains(m.messages[0], "Talk direction") {
		t.Fatalf("talk prompt state = %v messages=%#v", m.pendingTalk, m.messages)
	}

	next, cmd = m.handleKey(charmRuneKey('u'))
	if cmd == nil {
		t.Fatal("talk direction should dispatch an action")
	}
	m = next.(model)
	if m.pendingTalk {
		t.Fatal("talk direction should clear prompt")
	}

	next, _ = m.handleKey(charmRuneKey('t'))
	m = next.(model)
	next, cmd = m.handleKey(tea.KeyMsg{Type: tea.KeyEsc})
	if cmd != nil {
		t.Fatalf("talk escape returned command %#v, want nil", cmd)
	}
	m = next.(model)
	if m.pendingTalk || !strings.Contains(m.messages[0], "canceled talk") {
		t.Fatalf("talk cancel state = %v messages=%#v", m.pendingTalk, m.messages)
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

	descend, err := json.Marshal(actionPayload{Action: action{Tag: "descend"}})
	if err != nil {
		t.Fatal(err)
	}
	wantDescend := `{"action":{"_tag":"descend"}}`
	if string(descend) != wantDescend {
		t.Fatalf("encoded descend = %s, want %s", descend, wantDescend)
	}

	ascend, err := json.Marshal(actionPayload{Action: action{Tag: "ascend"}})
	if err != nil {
		t.Fatal(err)
	}
	wantAscend := `{"action":{"_tag":"ascend"}}`
	if string(ascend) != wantAscend {
		t.Fatalf("encoded ascend = %s, want %s", ascend, wantAscend)
	}

	talk, err := json.Marshal(actionPayload{Action: action{Tag: "talk", Dir: "NW"}})
	if err != nil {
		t.Fatal(err)
	}
	wantTalk := `{"action":{"_tag":"talk","dir":"NW"}}`
	if string(talk) != wantTalk {
		t.Fatalf("encoded talk = %s, want %s", talk, wantTalk)
	}

	travelStep, err := json.Marshal(actionPayload{Action: action{Tag: "travelStep", LandmarkID: "central-effigy"}})
	if err != nil {
		t.Fatal(err)
	}
	wantTravelStep := `{"action":{"_tag":"travelStep","landmarkId":"central-effigy"}}`
	if string(travelStep) != wantTravelStep {
		t.Fatalf("encoded travel step = %s, want %s", travelStep, wantTravelStep)
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

func TestParseActionMapsGreaterThanToDescend(t *testing.T) {
	got, ok := parseAction(">")
	if !ok || got.Tag != "descend" || got.Dir != "" || len(got.Keys) != 0 {
		t.Fatalf("parseAction(>) = %#v, %v; want descend", got, ok)
	}
}

func TestParseActionMapsLessThanToAscend(t *testing.T) {
	got, ok := parseAction("<")
	if !ok || got.Tag != "ascend" || got.Dir != "" || len(got.Keys) != 0 {
		t.Fatalf("parseAction(<) = %#v, %v; want ascend", got, ok)
	}
}

type campPropTestCase struct {
	kind     string
	char     string
	look     string
	passable bool
}

func campPropTestCases() []campPropTestCase {
	return []campPropTestCase{
		{kind: "arrival-gate", char: "G", look: "arrival gate", passable: true},
		{kind: "artwork", char: "A", look: "artwork", passable: false},
		{kind: "flagpole", char: "|", look: "flagpole", passable: false},
		{kind: "stage", char: "=", look: "stage", passable: true},
		{kind: "workbench", char: "W", look: "workbench", passable: false},
		{kind: "bike-rack", char: "B", look: "bike rack", passable: false},
		{kind: "directory", char: "D", look: "directory", passable: true},
		{kind: "water-station", char: "~", look: "water station", passable: false},
		{kind: "speaker", char: "S", look: "speaker", passable: false},
		{kind: "lantern", char: "L", look: "lantern", passable: true},
		{kind: "table", char: "T", look: "table", passable: false},
	}
}

func TestTileForCampgroundMarkers(t *testing.T) {
	tests := []struct {
		tag     string
		char    string
		variant string
	}{
		{tag: "tent", char: "^"},
		{tag: "mud", char: ";"},
		{tag: "tent-wall", char: "│", variant: "vertical"},
		{tag: "tent-post", char: "┼"},
		{tag: "door", char: "│", variant: "vertical"},
		{tag: "sign", char: "?"},
		{tag: "effigy", char: "Y"},
		{tag: "temple", char: "Ω"},
		{tag: "stairs-down", char: ">"},
		{tag: "stairs-up", char: "<"},
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

	seenPropGlyphs := map[string]string{}
	for _, tc := range campPropTestCases() {
		got := tileFor(entity{Tag: "camp-prop", Kind: tc.kind})
		if got.char != tc.char {
			t.Fatalf("tileFor(camp-prop/%s) char = %q, want %q", tc.kind, got.char, tc.char)
		}
		if len(got.char) != 1 {
			t.Fatalf("camp-prop/%s glyph %q occupies more than one ASCII cell", tc.kind, got.char)
		}
		if previous, exists := seenPropGlyphs[got.char]; exists {
			t.Fatalf("camp-prop/%s reuses glyph %q from %s", tc.kind, got.char, previous)
		}
		seenPropGlyphs[got.char] = tc.kind
	}
}

func TestMudIsVisiblePassableTerrainWithLookDescription(t *testing.T) {
	mud := entity{Key: "mud", Tag: "mud", In: "world", At: pos{X: 2, Y: 3, Z: 0}}
	if got := tileFor(mud).char; got != ";" {
		t.Fatalf("mud glyph = %q, want semicolon", got)
	}
	if !isPassableTerrain(mud) {
		t.Fatal("mud should be passable terrain")
	}
	if got := describeEntityForLook(mud); got != "mud puddle" {
		t.Fatalf("mud look text = %q, want mud puddle", got)
	}
}

func TestCampPropTerrainPassabilityIsExplicitPerKind(t *testing.T) {
	var decoded entity
	if err := json.Unmarshal([]byte(`{"key":"prop-1","at":{"x":2,"y":3,"z":0},"in":"world","_tag":"camp-prop","kind":"bike-rack"}`), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Tag != "camp-prop" || decoded.Kind != "bike-rack" {
		t.Fatalf("decoded camp prop = %#v, want bike-rack kind", decoded)
	}

	for _, tc := range campPropTestCases() {
		prop := entity{Tag: "camp-prop", Kind: tc.kind}
		if !isTerrain(prop) {
			t.Fatalf("camp-prop/%s should be terrain", tc.kind)
		}
		if got := isCampPropPassable(tc.kind); got != tc.passable {
			t.Fatalf("isCampPropPassable(%s) = %v, want %v", tc.kind, got, tc.passable)
		}
		if got := isPassableTerrain(prop); got != tc.passable {
			t.Fatalf("isPassableTerrain(camp-prop/%s) = %v, want %v", tc.kind, got, tc.passable)
		}
	}
	if isCampPropPassable("unknown") {
		t.Fatal("unknown camp prop kinds should fail closed")
	}
}

func TestCampPropLayeringAndLookNames(t *testing.T) {
	floor := entity{Key: "floor", Tag: "floor", In: "world", At: pos{X: 1, Y: 2, Z: 0}}
	item := entity{Key: "beer", Tag: "beer", In: "world", At: pos{X: 1, Y: 2, Z: 0}}
	player := entity{Key: "player", Tag: "player", In: "world", At: pos{X: 1, Y: 2, Z: 0}}

	for _, tc := range campPropTestCases() {
		prop := entity{Key: "prop", Tag: "camp-prop", Kind: tc.kind, In: "world", At: pos{X: 1, Y: 2, Z: 0}}
		if got := drawWorld([]entity{floor, prop}, nil)[2][1].char; got != tc.char {
			t.Fatalf("camp-prop/%s should layer over floor: got %q, want %q", tc.kind, got, tc.char)
		}
		if got := drawWorld([]entity{prop, item}, nil)[2][1].char; got != "!" {
			t.Fatalf("item should layer over camp-prop/%s, got %q", tc.kind, got)
		}
		if got := drawWorld([]entity{prop, player}, nil)[2][1].char; got != "@" {
			t.Fatalf("player should layer over camp-prop/%s, got %q", tc.kind, got)
		}
		if got := describeEntityForLook(prop); got != tc.look {
			t.Fatalf("look name for camp-prop/%s = %q, want %q", tc.kind, got, tc.look)
		}
	}
}

func TestCampgroundFlagUsesCrypticColorIndependentRendering(t *testing.T) {
	campgroundFlag := entity{
		Key: "campground-missing-flag",
		Tag: "flag",
		In:  "world",
		At:  pos{X: 1, Y: 1, Z: 0},
	}
	ordinaryFlag := entity{
		Key: "ordinary-flag",
		Tag: "flag",
		In:  "world",
		At:  pos{X: 2, Y: 1, Z: 0},
	}

	if got := tileFor(campgroundFlag).char; got != "f" {
		t.Fatalf("campground flag glyph = %q, want lowercase f", got)
	}
	if got := describeEntityForLook(campgroundFlag); got != "dust-caked flag" {
		t.Fatalf("campground flag look text = %q, want cryptic description", got)
	}
	if got := tileFor(ordinaryFlag).char; got != "F" {
		t.Fatalf("ordinary flag glyph = %q, want uppercase F", got)
	}
	if got := describeEntityForLook(ordinaryFlag); got != "flag" {
		t.Fatalf("ordinary flag look text = %q, want flag", got)
	}
	for _, forbidden := range []string{"special", "quest", "missing"} {
		if strings.Contains(describeEntityForLook(campgroundFlag), forbidden) {
			t.Fatalf("campground flag description exposes %q", forbidden)
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
		{Key: "stairs-down-5", Tag: "stairs-down", In: "world", At: pos{X: 5, Y: 0, Z: 0}},
		{Key: "stairs-up-6", Tag: "stairs-up", In: "world", At: pos{X: 6, Y: 0, Z: 0}},
	}
	path := findTravelDirections(world, pos{X: 0, Y: 0, Z: 0}, pos{X: 6, Y: 0, Z: 0})
	if len(path) != 6 || path[0] != "E" || path[1] != "E" || path[2] != "E" || path[3] != "E" || path[4] != "E" || path[5] != "E" {
		t.Fatalf("path = %#v, want [E E E E E E]", path)
	}
}

func TestDescribeLookTargetListsCoordinatesAndVisibleContents(t *testing.T) {
	world := []entity{
		{Key: "floor-0", Tag: "floor", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "tent-wall-1", Tag: "tent-wall", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Variant: "vertical"},
		{Key: "tent-post-1", Tag: "tent-post", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "sign-1", Tag: "sign", In: "world", At: pos{X: 1, Y: 0, Z: 0}, Name: "Camp Type Safety"},
		{Key: "stairs-down-1", Tag: "stairs-down", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "stairs-up-1", Tag: "stairs-up", In: "world", At: pos{X: 1, Y: 0, Z: 0}},
		{Key: "beer-1", Tag: "beer", In: "cooler-1", At: pos{X: 0, Y: 0, Z: 0}},
	}

	got := describeLookTarget(world, pos{X: 1, Y: 0, Z: 0})
	if !strings.Contains(got, "Look 1,0:") {
		t.Fatalf("look description missing coordinates: %q", got)
	}
	if !strings.Contains(got, "sign: Camp Type Safety") || !strings.Contains(got, "dusty ground") || !strings.Contains(got, "tent-wall") || !strings.Contains(got, "tent-post") || !strings.Contains(got, "stairs down") || !strings.Contains(got, "stairs up") {
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

func TestEatAndQuaffSelectExactlyOneFilteredItemImmediately(t *testing.T) {
	tests := []struct {
		name        string
		command     rune
		kind        popupKind
		title       string
		inventory   []entity
		wantKey     string
		wantTag     string
		wantPayload string
	}{
		{
			name:    "eat",
			command: 'e',
			kind:    popupEat,
			title:   "Eat what?",
			inventory: []entity{
				{Key: "food-a", Tag: "hotdog", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "drink-a", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "food-b", Tag: "cheese", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "flag-a", Tag: "flag", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
			},
			wantKey:     "food-b",
			wantTag:     "eatMulti",
			wantPayload: `{"action":{"_tag":"eatMulti","keys":["food-b"]}}`,
		},
		{
			name:    "quaff",
			command: 'q',
			kind:    popupQuaff,
			title:   "Quaff what?",
			inventory: []entity{
				{Key: "drink-a", Tag: "beer", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "food-a", Tag: "hotdog", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "drink-b", Tag: "water", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
				{Key: "flag-a", Tag: "flag", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
			},
			wantKey:     "drink-b",
			wantTag:     "quaffMulti",
			wantPayload: `{"action":{"_tag":"quaffMulti","keys":["drink-b"]}}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			posted := ""
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/act" {
					http.NotFound(w, r)
					return
				}
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Errorf("read action body: %v", err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				posted = string(body)
				w.WriteHeader(http.StatusNoContent)
			}))
			defer server.Close()

			m := newModel()
			m.client = apiClient{baseURL: server.URL, http: server.Client(), perf: &perfRecorder{source: "charm"}}
			m.streamActive = true
			m.inventory = tc.inventory

			next, cmd := m.handleKey(charmRuneKey(tc.command))
			if cmd != nil {
				t.Fatalf("%s key returned command %#v, want selection prompt", tc.name, cmd)
			}
			m = next.(model)
			if m.popup == nil || m.popup.kind != tc.kind || m.popup.title != tc.title {
				t.Fatalf("%s popup = %#v, want %s", tc.name, m.popup, tc.title)
			}
			if len(m.popup.items) != 2 {
				t.Fatalf("%s popup items = %#v, want two filtered choices", tc.name, m.popup.items)
			}
			view := renderSidebarPopup(*m.popup)
			if !strings.Contains(view, "letter selects") || !strings.Contains(view, "immediately") {
				t.Fatalf("%s popup missing immediate-selection help: %q", tc.name, view)
			}
			for _, forbidden := range []string{"letters toggle", "· , all", "space ok", "[ ]"} {
				if strings.Contains(view, forbidden) {
					t.Fatalf("%s popup still advertises multiselect %q: %q", tc.name, forbidden, view)
				}
			}

			for _, ignored := range []string{",", "space"} {
				next, cmd = m.handlePopupKey(ignored)
				if cmd != nil {
					t.Fatalf("%s %q returned a command before item choice", tc.name, ignored)
				}
				m = next.(model)
				if m.popup == nil || len(m.popup.marked) != 0 {
					t.Fatalf("%s %q changed single-item selection: %#v", tc.name, ignored, m.popup)
				}
			}

			next, cmd = m.handlePopupKey("b")
			if cmd == nil {
				t.Fatalf("%s item letter should dispatch immediately", tc.name)
			}
			m = next.(model)
			if m.popup != nil || m.mutationSerial != 1 {
				t.Fatalf("%s selection left popup=%#v mutation=%d", tc.name, m.popup, m.mutationSerial)
			}
			msg := cmd().(actionDoneMsg)
			if msg.err != nil {
				t.Fatal(msg.err)
			}
			if msg.caseName != tc.wantTag || posted != tc.wantPayload {
				t.Fatalf("%s selected %s; case=%q payload=%s", tc.name, tc.wantKey, msg.caseName, posted)
			}
		})
	}
}

func TestEatAndQuaffEmptyOrCanceledSelectionDoesNotDispatch(t *testing.T) {
	tests := []struct {
		command      rune
		eligibleItem entity
		emptyMessage string
	}{
		{
			command:      'e',
			eligibleItem: entity{Key: "food", Tag: "hotdog", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
			emptyMessage: "nothing to eat",
		},
		{
			command:      'q',
			eligibleItem: entity{Key: "drink", Tag: "water", In: "player", At: pos{X: 0, Y: 0, Z: 0}},
			emptyMessage: "nothing to quaff",
		},
	}

	for _, tc := range tests {
		t.Run(string(tc.command), func(t *testing.T) {
			m := newModel()
			m.setup = setupState{Phase: "complete"}
			m.inventory = []entity{{Key: "flag", Tag: "flag", In: "player", At: pos{X: 0, Y: 0, Z: 0}}}

			next, cmd := m.handleKey(charmRuneKey(tc.command))
			m = next.(model)
			if cmd != nil || m.popup != nil || m.mutationSerial != 0 || len(m.messages) == 0 || m.messages[0] != tc.emptyMessage {
				t.Fatalf("empty %q flow: cmd=%#v popup=%#v mutation=%d messages=%#v", tc.command, cmd, m.popup, m.mutationSerial, m.messages)
			}

			m.inventory = []entity{tc.eligibleItem}
			next, cmd = m.handleKey(charmRuneKey(tc.command))
			if cmd != nil {
				t.Fatalf("%q prompt returned command %#v", tc.command, cmd)
			}
			m = next.(model)
			next, cmd = m.handlePopupKey("escape")
			m = next.(model)
			if cmd != nil || m.popup != nil || m.mutationSerial != 0 {
				t.Fatalf("canceled %q flow: cmd=%#v popup=%#v mutation=%d", tc.command, cmd, m.popup, m.mutationSerial)
			}
		})
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

func TestRenderStatusLabelsFirstDungeonAsLevelOne(t *testing.T) {
	status := renderStatus([]entity{{Key: "player", Tag: "player", In: "world", At: pos{X: 1, Y: 1, Z: 1}, Name: "Ada"}})
	if !strings.Contains(status, "Dlvl:1") {
		t.Fatalf("first dungeon status missing level one label: %q", status)
	}
	if strings.Contains(status, "Dlvl:2") {
		t.Fatalf("first dungeon should not be rendered as level two: %q", status)
	}
}

func TestCampgroundOverviewStatusLookAndHelpUseServerProjection(t *testing.T) {
	campground := campgroundView{
		CurrentAddress: "N-1, Lantern Road",
		Weather:        &campgroundWeather{Condition: "heavy-rain"},
		DiscoveredLandmarks: []campgroundLandmark{
			{
				ID: "arrival-plaza", Name: "Arrival Plaza", Kind: "civic",
				At: pos{X: 96, Y: 120, Z: 0}, Address: "Gate and Main Road",
				TravelAvailable: true,
			},
			{
				ID: "temple", Name: "The Temple", Kind: "temple",
				At: pos{X: 270, Y: 44, Z: 0}, Address: "Far end of Temple Road",
			},
		},
		ActiveEvent: &campgroundActiveEvent{
			Kind: "meal", Name: "Pancake Breakfast", LandmarkID: "dusty-spoon",
		},
	}
	overview := renderCampgroundOverview(campground)
	for _, expected := range []string{
		"Current address: N-1, Lantern Road",
		"Weather: heavy rain",
		"Arrival Plaza",
		"Far end of Temple Road",
		"Active event: Pancake Breakfast",
		"G gate",
	} {
		if !strings.Contains(overview, expected) {
			t.Fatalf("overview missing %q: %q", expected, overview)
		}
	}

	world := []entity{
		{Key: "floor", Tag: "floor", In: "world", At: pos{X: 96, Y: 120, Z: 0}},
		{Key: "player", Tag: "player", In: "world", At: pos{X: 96, Y: 120, Z: 0}},
	}
	status := renderStatus(world, campground)
	if !strings.Contains(status, "Address: N-1, Lantern Road") {
		t.Fatalf("status missing projected campground text: %q", status)
	}
	if !strings.Contains(status, "Weather: heavy rain") {
		t.Fatalf("status missing projected weather: %q", status)
	}
	look := describeLookTargetWithCampground(world, pos{X: 96, Y: 120, Z: 0}, campground)
	if !strings.Contains(look, "landmark: Arrival Plaza (civic) — Gate and Main Road") {
		t.Fatalf("look missing projected landmark identity: %q", look)
	}
	lookPanel := renderLookPanel(world, pos{X: 96, Y: 120, Z: 0}, campground)
	if !strings.Contains(lookPanel, "Address: N-1, Lantern Road") {
		t.Fatalf("look panel missing projected address: %q", lookPanel)
	}
	if strings.Contains(overview+status+lookPanel, "Objective:") {
		t.Fatalf("campground UI must not expose a quest tracker: %q", overview+status+lookPanel)
	}

	m := newModel()
	m.setup = setupState{Phase: "complete"}
	m.world = world
	m.campground = campground
	next, cmd := m.handleKey(charmRuneKey('O'))
	if cmd != nil {
		t.Fatalf("overview key returned command %#v", cmd)
	}
	m = next.(model)
	view := m.View()
	if !m.overviewOpen || !strings.Contains(view, "Campground overview") || !strings.Contains(view, "t talk") || !strings.Contains(view, "_ landmark/map travel") {
		t.Fatalf("overview/help missing from view: %q", view)
	}
}

func TestLandmarkTravelPopupOffersDestinationsAndMapCursor(t *testing.T) {
	newTravelModel := func() model {
		m := newModel()
		m.setup = setupState{Phase: "complete"}
		m.world = []entity{
			{Key: "floor", Tag: "floor", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
			{Key: "player", Tag: "player", In: "world", At: pos{X: 0, Y: 0, Z: 0}},
		}
		m.campground = campgroundView{DiscoveredLandmarks: []campgroundLandmark{
			{ID: "temple", Name: "The Temple", Kind: "temple", At: pos{X: 10, Y: 0, Z: 0}, Address: "Temple Road", TravelAvailable: true},
			{ID: "effigy", Name: "The Effigy", Kind: "effigy", At: pos{X: 5, Y: 0, Z: 0}, Address: "Center", TravelAvailable: false},
		}}
		return m
	}

	m := newTravelModel()
	next, cmd := m.handleKey(charmRuneKey('_'))
	if cmd != nil {
		t.Fatalf("travel menu key returned command %#v", cmd)
	}
	m = next.(model)
	if m.landmarkPopup == nil {
		t.Fatal("travel menu did not open")
	}
	popup := renderLandmarkPopup(*m.landmarkPopup)
	if !strings.Contains(popup, "* - map cursor") || !strings.Contains(popup, "The Temple") || !strings.Contains(popup, "The Effigy") || !strings.Contains(popup, "(unavailable)") {
		t.Fatalf("landmark popup missing options: %q", popup)
	}
	next, cmd = m.handleKey(charmRuneKey('*'))
	if cmd != nil {
		t.Fatalf("map cursor choice returned command %#v", cmd)
	}
	m = next.(model)
	if m.landmarkPopup != nil || m.travelTarget == nil || *m.travelTarget != (pos{X: 0, Y: 0, Z: 0}) {
		t.Fatalf("map cursor state = popup %#v target %#v", m.landmarkPopup, m.travelTarget)
	}

	m = newTravelModel()
	next, _ = m.handleKey(charmRuneKey('_'))
	m = next.(model)
	landmark, ok := landmarkForLetter(m.landmarkPopup.landmarks, "a")
	if !ok || landmark.ID != "temple" {
		t.Fatalf("letter a destination = %#v, %v; want temple", landmark, ok)
	}
	next, cmd = m.handleKey(charmRuneKey('a'))
	if cmd == nil {
		t.Fatal("landmark choice did not start travel")
	}
	m = next.(model)
	if m.landmarkPopup != nil || m.autoCancel == nil {
		t.Fatalf("landmark travel state = popup %#v cancel %#v", m.landmarkPopup, m.autoCancel)
	}
	next, _ = m.handleKey(charmRuneKey('x'))
	m = next.(model)
	if m.autoCancel != nil || !strings.Contains(m.messages[0], "automove canceled") {
		t.Fatalf("landmark travel did not remain cancellable: %#v", m.messages)
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
	for _, want := range []string{"St:--", "HP:--/--", "Dlvl:2"} {
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
