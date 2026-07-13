package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const (
	boardWidth                 = 80
	boardHeight                = 20
	fixedEventAreaLines        = 10
	maxVisibleMsgs             = 50
	maxAutoMoveSteps           = boardWidth * boardHeight
	defaultBaseURL             = "http://127.0.0.1:3000"
	localMutationHeaderName    = "x-flaghack-client-intent"
	localMutationHeaderValue   = "local-game-command"
	clientStateStreamPath      = "/client-state/stream"
	clientStateStreamEventName = "client-state"
	travelWorldRefreshInterval = 24
)

type pos struct {
	X int `json:"x"`
	Y int `json:"y"`
	Z int `json:"z"`
}

type attributes struct {
	Strength     int `json:"strength"`
	Dexterity    int `json:"dexterity"`
	Constitution int `json:"constitution"`
	Intelligence int `json:"intelligence"`
	Wisdom       int `json:"wisdom"`
	Charisma     int `json:"charisma"`
}

type entity struct {
	Key        string      `json:"key"`
	At         pos         `json:"at"`
	In         string      `json:"in"`
	Tag        string      `json:"_tag"`
	Kind       string      `json:"kind,omitempty"`
	Variant    string      `json:"variant,omitempty"`
	Open       bool        `json:"open,omitempty"`
	Name       string      `json:"name,omitempty"`
	Role       string      `json:"role,omitempty"`
	Attributes *attributes `json:"attributes,omitempty"`
}

type role struct {
	ID                string     `json:"id"`
	Letter            string     `json:"letter"`
	Name              string     `json:"name"`
	Attributes        attributes `json:"attributes"`
	StartingInventory []string   `json:"startingInventory"`
	Equipment         []string   `json:"equipment"`
}

type setupState struct {
	Phase          string `json:"phase"`
	SelectedRoleID string `json:"selectedRoleId,omitempty"`
}

func (s setupState) complete() bool {
	return s.Phase == "" || s.Phase == "complete"
}

type action struct {
	Tag          string
	Dir          string
	ContainerKey string
	LandmarkID   string
	Keys         []string
}

func (a action) MarshalJSON() ([]byte, error) {
	payload := map[string]any{"_tag": a.Tag}
	if a.Dir != "" {
		payload["dir"] = a.Dir
	}
	if a.ContainerKey != "" {
		payload["containerKey"] = a.ContainerKey
	}
	if a.LandmarkID != "" {
		payload["landmarkId"] = a.LandmarkID
	}
	if actionUsesKeys(a.Tag) {
		if a.Keys == nil {
			payload["keys"] = []string{}
		} else {
			payload["keys"] = a.Keys
		}
	}
	return json.Marshal(payload)
}

func actionUsesKeys(tag string) bool {
	switch tag {
	case "pickupMulti", "dropMulti", "lootTakeMulti", "lootPutMulti", "eatMulti", "quaffMulti":
		return true
	default:
		return false
	}
}

type actionPayload struct {
	Action action `json:"action"`
}

type rolePayload struct {
	RoleID string `json:"roleId"`
}

type setupConfirmPayload struct {
	Confirm bool `json:"confirm"`
}

type apiClient struct {
	baseURL string
	http    *http.Client
	perf    *perfRecorder
}

type gameplayEvent struct {
	ID               int    `json:"id"`
	Kind             string `json:"kind,omitempty"`
	Message          string `json:"message"`
	InterruptsTravel *bool  `json:"interruptsTravel,omitempty"`
}

type campgroundLandmark struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Kind            string `json:"kind"`
	At              pos    `json:"at"`
	Address         string `json:"address"`
	TravelAvailable bool   `json:"travelAvailable"`
}

type campgroundActiveEvent struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	LandmarkID string `json:"landmarkId"`
	HostCampID string `json:"hostCampId,omitempty"`
	EndTurn    int    `json:"endTurn,omitempty"`
}

type campgroundWeather struct {
	Condition string `json:"condition"`
}

type campgroundView struct {
	CurrentAddress      string                 `json:"currentAddress,omitempty"`
	DiscoveredLandmarks []campgroundLandmark   `json:"discoveredLandmarks"`
	ActiveEvent         *campgroundActiveEvent `json:"activeEvent,omitempty"`
	Weather             *campgroundWeather     `json:"weather,omitempty"`
}

type snapshot struct {
	world          []entity
	inventory      []entity
	roles          []role
	setup          setupState
	gameplayEvents []gameplayEvent
	campground     *campgroundView
}

type clientStateResponse struct {
	World          [][]json.RawMessage `json:"world"`
	Inventory      [][]json.RawMessage `json:"inventory"`
	Roles          []role              `json:"roles"`
	Setup          setupState          `json:"setup"`
	GameplayEvents []gameplayEvent     `json:"gameplayEvents"`
	Campground     campgroundView      `json:"campground"`
}

type clientStateStreamEvent struct {
	Revision         int                 `json:"revision"`
	PreviousRevision *int                `json:"previousRevision,omitempty"`
	Source           string              `json:"source"`
	Terminal         string              `json:"terminal,omitempty"`
	ClientState      clientStateResponse `json:"clientState"`
}

type clientStateStreamResult struct {
	event clientStateStreamEvent
	err   error
}

type clientStateStream struct {
	events <-chan clientStateStreamResult
	cancel context.CancelFunc
}

type tile struct {
	char   string
	color  lipgloss.Color
	bright bool
}

type moveCommand struct {
	tag string
	dir string
}

type popupKind string

const (
	popupPickup popupKind = "pickup"
	popupDrop   popupKind = "drop"
	popupLoot   popupKind = "loot"
	popupEat    popupKind = "eat"
	popupQuaff  popupKind = "quaff"
)

type lootMode string

const (
	lootTake lootMode = "take"
	lootPut  lootMode = "put"
)

type popupStage string

const (
	popupStageAction popupStage = "action"
	popupStageItems  popupStage = "items"
)

type popupState struct {
	kind         popupKind
	title        string
	containerKey string
	mode         lootMode
	stage        popupStage
	items        []entity
	putItems     []entity
	marked       map[string]bool
}

type landmarkPopupState struct {
	landmarks []campgroundLandmark
	page      int
}

type autoRunResult struct {
	label string
	steps int
	kind  string
}

type autoRunSnapshot struct {
	result   autoRunResult
	snapshot snapshot
}

type stateLoadedMsg struct {
	snapshot         snapshot
	err              error
	perfTraceID      string
	responseReceived time.Time
}

type clientStateStreamMsg struct {
	stream           *clientStateStream
	event            clientStateStreamEvent
	err              error
	initial          bool
	perfTraceID      string
	responseReceived time.Time
}

type pickupLoadedMsg struct {
	requestID        int
	items            []entity
	err              error
	perfTraceID      string
	responseReceived time.Time
}

type lootContainersLoadedMsg struct {
	requestID        int
	containers       []entity
	err              error
	perfTraceID      string
	responseReceived time.Time
}

type lootItemsLoadedMsg struct {
	requestID        int
	items            []entity
	err              error
	perfTraceID      string
	responseReceived time.Time
}

type actionDoneMsg struct {
	snapshot         snapshot
	err              error
	caseName         string
	perfTraceID      string
	responseReceived time.Time
	streamed         bool
}

type setupDoneMsg struct {
	snapshot         snapshot
	err              error
	caseName         string
	perfTraceID      string
	requestID        int
	responseReceived time.Time
}

type saveDoneMsg struct {
	err              error
	perfTraceID      string
	responseReceived time.Time
}

type quitDoneMsg struct {
	err              error
	perfTraceID      string
	responseReceived time.Time
}

type autoDoneMsg struct {
	id               int
	cancel           <-chan struct{}
	mutationSerial   int
	result           autoRunResult
	snapshot         snapshot
	err              error
	caseName         string
	perfTraceID      string
	responseReceived time.Time
}

type model struct {
	client                  apiClient
	world                   []entity
	inventory               []entity
	roles                   []role
	setup                   setupState
	campground              campgroundView
	messages                []string
	openingExposition       string
	debugMessages           bool
	pendingMovementPrefix   string
	pendingDoorAction       string
	pendingTalk             bool
	pendingExtendedCommand  *string
	pendingQuitConfirmation bool
	pendingTerminalAction   bool
	travelTarget            *pos
	lookTarget              *pos
	popup                   *popupState
	landmarkPopup           *landmarkPopupState
	overviewOpen            bool
	pickupRequestID         int
	lootRequestID           int
	mutationSerial          int
	setupRequestID          int
	setupPending            bool
	autoCancel              chan struct{}
	autoID                  int
	width                   int
	height                  int
	perf                    *perfRecorder
	stream                  *clientStateStream
	streamActive            bool
	lastStreamRevision      int
	lastGameplayEventID     int
}

var (
	mutedStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	helpStyle       = lipgloss.NewStyle().Foreground(lipgloss.Color("14"))
	messageStyle    = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1)
	sidebarStyle    = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1).Width(20)
	statusStyle     = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1).Width(118)
	popupStyle      = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(0, 1).Width(34)
	setupStyle      = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(1, 2).Width(34)
	expositionStyle = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(1, 2)
	selectedStyle   = lipgloss.NewStyle().Reverse(true)
)

func main() {
	program := tea.NewProgram(newModel(), tea.WithAltScreen())
	if _, err := program.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "cli:charm failed: %v\n", err)
		os.Exit(1)
	}
}

func newModel() model {
	return newModelWithOptions(resolveClientOptions(os.Args[1:], os.Environ()))
}

type clientOptions struct {
	debugMessages bool
}

func newModelWithOptions(options clientOptions) model {
	perf := newPerfRecorderFromEnv("charm")
	return model{
		client: apiClient{
			baseURL: resolveBaseURL(os.Environ()),
			http:    &http.Client{Timeout: 10 * time.Second},
			perf:    perf,
		},
		debugMessages:      options.debugMessages,
		lastStreamRevision: -1,
		messages:           []string{},
		perf:               perf,
	}
}

func resolveClientOptions(args []string, environ []string) clientOptions {
	return clientOptions{debugMessages: resolveDebugMessages(args, environ)}
}

func resolveBaseURL(environ []string) string {
	for _, item := range environ {
		key, value, ok := strings.Cut(item, "=")
		if ok && key == "FLAGHACK_API_URL" && strings.TrimSpace(value) != "" {
			return strings.TrimRight(strings.TrimSpace(value), "/")
		}
	}
	return defaultBaseURL
}

func resolveDebugMessages(args []string, environ []string) bool {
	debugMessages := false
	for _, item := range environ {
		key, value, ok := strings.Cut(item, "=")
		if ok && key == "FLAGHACK_DEBUG_MESSAGES" && truthyFlagValue(value) {
			debugMessages = true
		}
	}
	for _, arg := range args {
		switch strings.TrimSpace(arg) {
		case "--debug-messages", "--debug":
			debugMessages = true
		case "--no-debug-messages":
			debugMessages = false
		default:
			name, value, ok := strings.Cut(arg, "=")
			if ok && (name == "--debug-messages" || name == "--debug") {
				debugMessages = truthyFlagValue(value)
			}
		}
	}
	return debugMessages
}

func truthyFlagValue(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func (m model) Init() tea.Cmd {
	return openClientStateStreamCmd(m.client)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil
	case stateLoadedMsg:
		if msg.err != nil {
			m.addMessage("initial load failed: " + msg.err.Error())
			return m, nil
		}
		m.applySnapshot(msg.snapshot)
		m.perf.markResponseReceived("loadState", "initial", msg.perfTraceID, msg.responseReceived)
		return m, nil
	case clientStateStreamMsg:
		if msg.err != nil {
			if msg.stream != nil {
				msg.stream.cancel()
			}
			m.stream = nil
			m.streamActive = false
			if msg.initial {
				m.addDebugMessage("client-state stream unavailable; falling back to polling")
				return m, loadStateCmd(m.client)
			}
			m.addDebugMessage("client-state stream stopped: " + msg.err.Error())
			if m.pendingTerminalAction {
				return m, nil
			}
			return m, loadStateCmd(m.client)
		}
		if msg.stream != nil {
			m.stream = msg.stream
			m.streamActive = true
		}
		if msg.event.Revision > m.lastStreamRevision {
			m.lastStreamRevision = msg.event.Revision
			if msg.event.Terminal != "" {
				m.pendingTerminalAction = true
				m.stopActiveAutoMove()
				if msg.stream != nil {
					msg.stream.cancel()
				}
				m.stream = nil
				m.streamActive = false
				if msg.event.Terminal == "save" {
					m.addMessage("saved")
				} else {
					m.addMessage("quit")
				}
				return m, tea.Quit
			}
			snap, err := msg.event.snapshot()
			if err != nil {
				if msg.stream != nil {
					msg.stream.cancel()
				}
				m.stream = nil
				m.streamActive = false
				m.addMessage("stream update failed: " + err.Error())
				return m, loadStateCmd(m.client)
			}
			m.applySnapshot(snap)
			if msg.event.Source == "setup" {
				m.setupPending = false
			}
		}
		if m.stream == nil {
			return m, nil
		}
		return m, nextClientStateStreamEventCmd(m.stream)
	case pickupLoadedMsg:
		if m.pendingTerminalAction || m.popup == nil || m.popup.kind != popupPickup || msg.requestID != m.pickupRequestID {
			return m, nil
		}
		if msg.err != nil {
			m.addMessage("pickup failed: " + msg.err.Error())
			return m, nil
		}
		m.popup.items = msg.items
		m.popup.marked = map[string]bool{}
		m.perf.markResponseReceived("loadPickup", "pickup", msg.perfTraceID, msg.responseReceived)
		return m, nil
	case lootContainersLoadedMsg:
		if m.pendingTerminalAction || msg.requestID != m.lootRequestID {
			return m, nil
		}
		if msg.err != nil {
			m.addMessage("loot failed: " + msg.err.Error())
			return m, nil
		}
		if len(msg.containers) == 0 {
			m.popup = nil
			m.addMessage("no floor container here")
			return m, nil
		}
		sort.SliceStable(msg.containers, func(i, j int) bool { return msg.containers[i].Key < msg.containers[j].Key })
		container := msg.containers[0]
		m.popup = &popupState{kind: popupLoot, title: "Loot " + container.Tag, containerKey: container.Key, mode: lootTake, stage: popupStageAction, items: []entity{}, putItems: m.inventory, marked: map[string]bool{}}
		m.addMessage("looting " + container.Tag)
		m.perf.markResponseReceived("loadLootContainers", "loot", msg.perfTraceID, msg.responseReceived)
		return m, loadLootItemsCmd(m.client, m.lootRequestID, container.Key)
	case lootItemsLoadedMsg:
		if m.pendingTerminalAction || m.popup == nil || m.popup.kind != popupLoot || msg.requestID != m.lootRequestID {
			return m, nil
		}
		if msg.err != nil {
			m.addMessage("loot failed: " + msg.err.Error())
			return m, nil
		}
		m.popup.items = msg.items
		m.popup.marked = map[string]bool{}
		m.perf.markResponseReceived("loadLootItems", "loot", msg.perfTraceID, msg.responseReceived)
		return m, nil
	case actionDoneMsg:
		if m.pendingTerminalAction {
			return m, nil
		}
		if msg.err != nil {
			m.addMessage("action failed: " + msg.err.Error())
			return m, nil
		}
		if !msg.streamed {
			m.applySnapshot(msg.snapshot)
		}
		phase := "actionAndRefresh"
		if msg.streamed {
			phase = "action"
		}
		m.perf.markResponseReceived(phase, msg.caseName, msg.perfTraceID, msg.responseReceived)
		return m, nil
	case setupDoneMsg:
		if m.pendingTerminalAction {
			return m, nil
		}
		if msg.requestID != m.setupRequestID {
			return m, nil
		}
		m.setupPending = false
		if msg.err != nil {
			m.addMessage("setup failed: " + msg.err.Error())
			return m, nil
		}
		m.applySnapshot(msg.snapshot)
		m.perf.markResponseReceived("setup", msg.caseName, msg.perfTraceID, msg.responseReceived)
		return m, nil
	case saveDoneMsg:
		if msg.err != nil {
			m.pendingTerminalAction = false
			m.addMessage("save failed: " + msg.err.Error())
			return m, nil
		}
		m.addMessage("saved")
		m.perf.markResponseReceived("save", "save", msg.perfTraceID, msg.responseReceived)
		return m, tea.Quit
	case quitDoneMsg:
		if msg.err != nil {
			m.pendingTerminalAction = false
			m.addMessage("quit failed: " + msg.err.Error())
			return m, nil
		}
		m.addMessage("quit")
		m.perf.markResponseReceived("quit", "quit", msg.perfTraceID, msg.responseReceived)
		return m, tea.Quit
	case autoDoneMsg:
		if m.pendingTerminalAction {
			return m, nil
		}
		isCurrentAutoMove := m.autoCancel != nil && m.autoCancel == msg.cancel && m.autoID == msg.id
		isFinishedCurrentAutoMove := m.autoCancel == nil && m.autoID == msg.id && msg.mutationSerial == m.mutationSerial
		if !isCurrentAutoMove && !isFinishedCurrentAutoMove {
			return m, nil
		}
		m.autoCancel = nil
		if msg.err != nil {
			m.addMessage(msg.result.label + " failed: " + msg.err.Error())
			return m, nil
		}
		m.applySnapshot(msg.snapshot)
		m.addMessage(formatAutoResult(msg.result))
		m.perf.markResponseReceived("autoMove", msg.caseName, msg.perfTraceID, msg.responseReceived)
		return m, nil
	case tea.KeyMsg:
		return m.handleKey(msg)
	default:
		return m, nil
	}
}

func (m model) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	input := normalizeBubbleTeaInput(msg)
	if input == "C-c" {
		return m, tea.Quit
	}
	if !m.readyForNormalPlay() {
		return m.handleSetupKey(input)
	}
	if m.pendingTerminalAction {
		return m, nil
	}
	if strings.TrimSpace(m.openingExposition) != "" {
		switch input {
		case "enter", " ", "escape":
			m.openingExposition = ""
		}
		return m, nil
	}
	if m.cancelActiveAutoMove() {
		return m, nil
	}
	if m.overviewOpen {
		return m.handleOverviewKey(input)
	}
	if m.landmarkPopup != nil {
		return m.handleLandmarkPopupKey(input)
	}
	if m.popup != nil {
		return m.handlePopupKey(input)
	}

	if m.pendingQuitConfirmation {
		return m.handleQuitConfirmationKey(input)
	}

	if input != "M-l" {
		m.lootRequestID++
	}

	m.addDebugMessage("doing " + input)

	if m.pendingTalk {
		return m.handleTalkDirectionKey(input)
	}
	if m.pendingDoorAction != "" {
		return m.handleDoorDirectionKey(input)
	}
	if m.pendingExtendedCommand != nil {
		return m.handleExtendedCommandKey(input)
	}
	if m.travelTarget != nil {
		return m.handleTravelTargetKey(input)
	}
	if m.lookTarget != nil {
		return m.handleLookTargetKey(input)
	}

	switch input {
	case "C-s":
		return m.saveAndExit()
	case "C-q":
		return m.beginQuitConfirmation()
	case "#":
		m.pendingDoorAction = ""
		m.pendingMovementPrefix = ""
		empty := ""
		m.pendingExtendedCommand = &empty
		m.addMessage("extended command: #")
		return m, nil
	case "o", "c":
		m.pendingTalk = false
		m.pendingMovementPrefix = ""
		if input == "o" {
			m.pendingDoorAction = "open"
		} else {
			m.pendingDoorAction = "close"
		}
		m.addMessage(doorDirectionPrompt(m.pendingDoorAction))
		return m, nil
	case "t":
		m.pendingDoorAction = ""
		m.pendingMovementPrefix = ""
		m.pendingTalk = true
		m.addMessage(talkDirectionPrompt())
		return m, nil
	case "O":
		m.pendingDoorAction = ""
		m.pendingMovementPrefix = ""
		m.pendingTalk = false
		m.overviewOpen = true
		return m, nil
	case "_":
		m.pendingDoorAction = ""
		m.pendingMovementPrefix = ""
		m.pendingTalk = false
		m.landmarkPopup = &landmarkPopupState{
			landmarks: sortedCampgroundLandmarks(m.campground.DiscoveredLandmarks),
		}
		return m, nil
	case ";":
		m.pendingMovementPrefix = ""
		player, ok := findPlayer(m.world)
		if !ok {
			m.addMessage("cannot look: player not found")
			return m, nil
		}
		target := clampTravelTarget(player.At, m.world)
		m.lookTarget = &target
		return m, nil
	case "M-l":
		m.pendingMovementPrefix = ""
		m.lootRequestID++
		m.popup = nil
		m.addMessage("looting")
		return m, loadLootContainersCmd(m.client, m.lootRequestID)
	case ",":
		m.pendingMovementPrefix = ""
		m.pickupRequestID++
		m.popup = &popupState{kind: popupPickup, title: "Pickup what?", stage: popupStageItems, items: []entity{}, marked: map[string]bool{}}
		m.addMessage("picking up ")
		return m, loadPickupCmd(m.client, m.pickupRequestID)
	case "d":
		m.pendingMovementPrefix = ""
		m.popup = &popupState{kind: popupDrop, title: "Drop what?", stage: popupStageItems, items: m.inventory, marked: map[string]bool{}}
		m.addMessage("dropping")
		return m, nil
	case "e":
		m.pendingMovementPrefix = ""
		items := filterFoodItems(m.inventory)
		if len(items) == 0 {
			m.addMessage("nothing to eat")
			return m, nil
		}
		m.popup = &popupState{kind: popupEat, title: "Eat what?", stage: popupStageItems, items: items, marked: map[string]bool{}}
		m.addMessage("eating")
		return m, nil
	case "q":
		m.pendingMovementPrefix = ""
		items := filterDrinkItems(m.inventory)
		if len(items) == 0 {
			m.addMessage("nothing to quaff")
			return m, nil
		}
		m.popup = &popupState{kind: popupQuaff, title: "Quaff what?", stage: popupStageItems, items: items, marked: map[string]bool{}}
		m.addMessage("quaffing")
		return m, nil
	}

	actionInput := input
	if m.pendingMovementPrefix != "" {
		prefix := m.pendingMovementPrefix
		m.pendingMovementPrefix = ""
		if isBaseMovementInput(input) {
			actionInput = prefix + "+" + input
		}
	} else if input == "g" || input == "G" || input == "m" || input == "M" {
		m.pendingMovementPrefix = input
		return m, nil
	}

	if command, ok := parseMovementCommand(actionInput); ok && requiresRepeatedMovement(command) {
		return m.startRepeatedMovement(command)
	}
	if act, ok := parseAction(actionInput); ok {
		m.mutationSerial++
		return m, actionCmd(m.client, act, m.streamActive)
	}
	return m, nil
}

func (m model) handleSetupKey(input string) (tea.Model, tea.Cmd) {
	if m.setupPending {
		return m, nil
	}

	normalizedInput := strings.ToLower(input)
	switch m.setup.Phase {
	case "selectRole":
		selected, ok := roleForLetter(m.roles, normalizedInput)
		if !ok {
			return m, nil
		}
		m.setup = setupState{Phase: "confirm", SelectedRoleID: selected.ID}
		m.setupPending = true
		m.setupRequestID++
		return m, selectRoleCmd(m.client, selected.ID, m.setupRequestID)
	case "confirm":
		switch normalizedInput {
		case "n":
			selectedRoleID := m.setup.SelectedRoleID
			m.setup = setupState{Phase: "selectRole"}
			m.setupPending = true
			m.setupRequestID++
			return m, confirmSetupCmd(m.client, selectedRoleID, false, m.setupRequestID)
		case "y":
			selectedRoleID := m.setup.SelectedRoleID
			if selectedRoleID == "" {
				return m, nil
			}
			m.setupPending = true
			m.setupRequestID++
			return m, confirmSetupCmd(m.client, selectedRoleID, true, m.setupRequestID)
		default:
			return m, nil
		}
	default:
		return m, nil
	}
}

func (m model) handleDoorDirectionKey(input string) (tea.Model, tea.Cmd) {
	kind := m.pendingDoorAction
	if input == "escape" {
		m.pendingDoorAction = ""
		m.addMessage("canceled " + kind)
		return m, nil
	}
	dir, ok := baseMovementDirections[input]
	m.pendingDoorAction = ""
	if !ok {
		m.addMessage("canceled " + kind)
		return m, nil
	}
	m.mutationSerial++
	return m, actionCmd(m.client, action{Tag: kind, Dir: dir}, m.streamActive)
}

func (m model) handleTalkDirectionKey(input string) (tea.Model, tea.Cmd) {
	if input == "escape" {
		m.pendingTalk = false
		m.addMessage("canceled talk")
		return m, nil
	}
	dir, ok := baseMovementDirections[input]
	m.pendingTalk = false
	if !ok {
		m.addMessage("canceled talk")
		return m, nil
	}
	m.mutationSerial++
	return m, actionCmd(m.client, action{Tag: "talk", Dir: dir}, m.streamActive)
}

func (m model) handleOverviewKey(input string) (tea.Model, tea.Cmd) {
	if input == "_" {
		m.overviewOpen = false
		m.landmarkPopup = &landmarkPopupState{
			landmarks: sortedCampgroundLandmarks(m.campground.DiscoveredLandmarks),
		}
		return m, nil
	}
	if input == "escape" || input == "O" || strings.EqualFold(input, "q") {
		m.overviewOpen = false
	}
	return m, nil
}

func (m model) handleLandmarkPopupKey(input string) (tea.Model, tea.Cmd) {
	popup := m.landmarkPopup
	if popup == nil {
		return m, nil
	}
	if input == "escape" || strings.EqualFold(input, "q") || strings.EqualFold(input, "r") {
		m.landmarkPopup = nil
		m.addMessage("canceled travel")
		return m, nil
	}
	if input == "*" {
		m.landmarkPopup = nil
		player, ok := findPlayer(m.world)
		if !ok {
			m.addMessage("cannot travel: player not found")
			return m, nil
		}
		target := clampTravelTarget(player.At, m.world)
		m.travelTarget = &target
		m.addMessage(travelPrompt(target))
		return m, nil
	}
	pageCount := landmarkPopupPageCount(len(popup.landmarks))
	if input == "[" {
		popup.page = max(0, popup.page-1)
		return m, nil
	}
	if input == "]" {
		popup.page = min(pageCount-1, popup.page+1)
		return m, nil
	}
	landmark, ok := landmarkForLetter(popup.landmarks, input)
	if !ok {
		return m, nil
	}
	m.landmarkPopup = nil
	return m.startLandmarkTravel(landmark)
}

func (m model) saveAndExit() (tea.Model, tea.Cmd) {
	m.pendingDoorAction = ""
	m.pendingExtendedCommand = nil
	m.pendingMovementPrefix = ""
	m.pendingQuitConfirmation = false
	m.pendingTerminalAction = true
	m.stopActiveAutoMove()
	m.addMessage("saving")
	return m, saveGameCmd(m.client)
}

func (m model) beginQuitConfirmation() (tea.Model, tea.Cmd) {
	m.pendingDoorAction = ""
	m.pendingExtendedCommand = nil
	m.pendingMovementPrefix = ""
	m.pendingQuitConfirmation = true
	m.addMessage(quitWarningPrompt())
	return m, nil
}

func (m model) handleQuitConfirmationKey(input string) (tea.Model, tea.Cmd) {
	switch strings.ToLower(input) {
	case "y":
		m.pendingQuitConfirmation = false
		m.pendingTerminalAction = true
		m.stopActiveAutoMove()
		m.addMessage("quitting")
		return m, quitGameCmd(m.client)
	case "n", "escape":
		m.pendingQuitConfirmation = false
		m.addMessage("quit canceled")
		return m, nil
	default:
		m.addMessage(quitWarningPrompt())
		return m, nil
	}
}

func (m model) handleExtendedCommandKey(input string) (tea.Model, tea.Cmd) {
	commandInput := ""
	if m.pendingExtendedCommand != nil {
		commandInput = *m.pendingExtendedCommand
	}
	switch input {
	case "escape":
		m.pendingExtendedCommand = nil
		m.addMessage("canceled extended command")
	case "C-h":
		if len(commandInput) > 0 {
			commandInput = commandInput[:len(commandInput)-1]
		}
		m.pendingExtendedCommand = &commandInput
	case "enter", "C-j":
		m.pendingExtendedCommand = nil
		switch strings.ToLower(strings.TrimPrefix(commandInput, "#")) {
		case "save":
			return m.saveAndExit()
		case "quit":
			return m.beginQuitConfirmation()
		default:
			m.addMessage("unknown extended command: #" + commandInput)
		}
	default:
		if len([]rune(input)) == 1 && isAlpha(input) {
			commandInput += strings.ToLower(input)
			m.pendingExtendedCommand = &commandInput
		} else {
			m.pendingExtendedCommand = nil
		}
	}
	return m, nil
}

func (m model) handleTravelTargetKey(input string) (tea.Model, tea.Cmd) {
	target := *m.travelTarget
	switch input {
	case "escape":
		m.travelTarget = nil
		m.addMessage("canceled travel")
		return m, nil
	case "enter", "C-j":
		m.travelTarget = nil
		player, ok := findPlayer(m.world)
		if !ok {
			m.addMessage("cannot travel: player not found")
			return m, nil
		}
		if samePos(player.At, target) {
			m.addMessage("already there")
			return m, nil
		}
		return m.startTravel(target)
	default:
		if command, ok := parseMovementCommand(input); ok {
			next := moveTravelTarget(target, command.dir, m.world)
			m.travelTarget = &next
			m.addMessage(travelPrompt(next))
		}
		return m, nil
	}
}

func (m model) handleLookTargetKey(input string) (tea.Model, tea.Cmd) {
	target := *m.lookTarget
	switch input {
	case "escape":
		m.lookTarget = nil
		m.addMessage("exited look mode")
		return m, nil
	default:
		if command, ok := parseMovementCommand(input); ok {
			next := moveTravelTarget(target, command.dir, m.world)
			m.lookTarget = &next
		}
		return m, nil
	}
}

func (m model) handlePopupKey(input string) (tea.Model, tea.Cmd) {
	popup := m.popup
	if popup == nil {
		return m, nil
	}
	if popupIsSingleItemAction(popup.kind) {
		if input == "q" || input == "r" || input == "escape" {
			kind := popup.kind
			m.popup = nil
			if kind == popupEat {
				m.addMessage("canceling eating")
			} else {
				m.addMessage("canceling quaffing")
			}
			return m, nil
		}
		key, ok := itemKeyForLetter(popupVisibleItems(*popup), input)
		if !ok {
			return m, nil
		}
		tag := "eatMulti"
		if popup.kind == popupQuaff {
			tag = "quaffMulti"
		}
		m.popup = nil
		m.mutationSerial++
		return m, actionCmd(m.client, action{Tag: tag, Keys: []string{key}}, m.streamActive)
	}
	switch input {
	case "q", "r", "escape":
		kind := popup.kind
		m.popup = nil
		switch kind {
		case popupDrop:
			m.addMessage("canceling multidrop")
		case popupLoot:
			m.addMessage("canceling loot")
		case popupEat:
			m.addMessage("canceling eating")
		case popupQuaff:
			m.addMessage("canceling quaffing")
		default:
			m.addMessage("canceling pickup")
		}
		return m, nil
	case "t":
		if popup.kind == popupLoot && popup.stage == popupStageAction {
			popup.mode = lootTake
			popup.stage = popupStageItems
			popup.marked = map[string]bool{}
			return m, nil
		}
		togglePopupLetter(popup, input)
		return m, nil
	case "p":
		if popup.kind == popupLoot && popup.stage == popupStageAction {
			popup.mode = lootPut
			popup.stage = popupStageItems
			popup.marked = map[string]bool{}
			return m, nil
		}
		togglePopupLetter(popup, input)
		return m, nil
	case ",":
		if popup.stage == popupStageAction {
			return m, nil
		}
		popup.marked = map[string]bool{}
		for _, item := range popupVisibleItems(*popup) {
			popup.marked[item.Key] = true
		}
		return m, nil
	case " ", "space":
		if popup.stage == popupStageAction {
			return m, nil
		}
		valid := itemKeySet(popupVisibleItems(*popup))
		keys := []string{}
		for key := range popup.marked {
			if valid[key] {
				keys = append(keys, key)
			}
		}
		sort.Strings(keys)
		kind := popup.kind
		containerKey := popup.containerKey
		mode := popup.mode
		m.popup = nil
		m.mutationSerial++
		if kind == popupPickup {
			return m, actionCmd(m.client, action{Tag: "pickupMulti", Keys: keys}, m.streamActive)
		}
		if kind == popupLoot {
			if mode == lootPut {
				return m, actionCmd(m.client, action{Tag: "lootPutMulti", ContainerKey: containerKey, Keys: keys}, m.streamActive)
			}
			return m, actionCmd(m.client, action{Tag: "lootTakeMulti", ContainerKey: containerKey, Keys: keys}, m.streamActive)
		}
		return m, actionCmd(m.client, action{Tag: "dropMulti", Keys: keys}, m.streamActive)
	default:
		togglePopupLetter(popup, input)
		return m, nil
	}
}

func popupIsSingleItemAction(kind popupKind) bool {
	return kind == popupEat || kind == popupQuaff
}

func togglePopupLetter(popup *popupState, input string) {
	if popup.stage == popupStageAction {
		return
	}
	if key, ok := itemKeyForLetter(popupVisibleItems(*popup), input); ok {
		toggleMarkedItem(popup.marked, key)
	}
}

func (m model) startRepeatedMovement(command moveCommand) (tea.Model, tea.Cmd) {
	m.autoID++
	m.mutationSerial++
	id := m.autoID
	mutationSerial := m.mutationSerial
	cancel := make(chan struct{})
	m.autoCancel = cancel
	initialWorld := cloneEntities(m.world)
	client := m.client
	traceID := client.perf.nextTraceID("charm.autorun")
	streamActive := m.streamActive
	return m, func() tea.Msg {
		var result autoRunResult
		var snap snapshot
		var err error
		if streamActive {
			result, snap, err = client.runDirectionalMovementStreamed(context.Background(), initialWorld, command, cancel)
		} else {
			result, snap, err = client.runDirectionalMovement(context.Background(), initialWorld, command, cancel)
		}
		return autoDoneMsg{id: id, cancel: cancel, mutationSerial: mutationSerial, result: result, snapshot: snap, err: err, caseName: command.tag, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func (m model) startTravel(target pos) (tea.Model, tea.Cmd) {
	m.autoID++
	m.mutationSerial++
	id := m.autoID
	mutationSerial := m.mutationSerial
	cancel := make(chan struct{})
	m.autoCancel = cancel
	initialWorld := cloneEntities(m.world)
	client := m.client
	traceID := client.perf.nextTraceID("charm.travel")
	m.addMessage("traveling")
	streamActive := m.streamActive
	baselineEventID := m.lastGameplayEventID
	return m, func() tea.Msg {
		var result autoRunResult
		var snap snapshot
		var err error
		if streamActive {
			result, snap, err = client.runTravelStreamedFromBaseline(context.Background(), initialWorld, target, baselineEventID, cancel)
		} else {
			result, snap, err = client.runTravelFromBaseline(context.Background(), initialWorld, target, baselineEventID, cancel)
		}
		return autoDoneMsg{id: id, cancel: cancel, mutationSerial: mutationSerial, result: result, snapshot: snap, err: err, caseName: "travel", perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func (m model) startLandmarkTravel(
	landmark campgroundLandmark,
) (tea.Model, tea.Cmd) {
	m.autoID++
	m.mutationSerial++
	id := m.autoID
	mutationSerial := m.mutationSerial
	cancel := make(chan struct{})
	m.autoCancel = cancel
	campground := m.campground
	initial := snapshot{
		world:      cloneEntities(m.world),
		campground: &campground,
	}
	client := m.client
	traceID := client.perf.nextTraceID("charm.landmarkTravel")
	streamActive := m.streamActive
	baselineEventID := m.lastGameplayEventID
	m.addMessage("traveling to " + landmark.Name)
	return m, func() tea.Msg {
		result, snap, err := client.runLandmarkTravel(
			context.Background(),
			initial,
			landmark.ID,
			baselineEventID,
			cancel,
			streamActive,
		)
		return autoDoneMsg{
			id:               id,
			cancel:           cancel,
			mutationSerial:   mutationSerial,
			result:           result,
			snapshot:         snap,
			err:              err,
			caseName:         "landmarkTravel",
			perfTraceID:      traceID,
			responseReceived: time.Now(),
		}
	}
}

func (m *model) addMessage(message string) {
	m.messages = append([]string{message}, m.messages...)
	if len(m.messages) > maxVisibleMsgs {
		m.messages = m.messages[:maxVisibleMsgs]
	}
}

func (m *model) addDebugMessage(message string) {
	if m.debugMessages {
		m.addMessage(message)
	}
}

func (m *model) stopActiveAutoMove() bool {
	if m.autoCancel == nil {
		return false
	}
	close(m.autoCancel)
	m.autoCancel = nil
	return true
}

func (m *model) cancelActiveAutoMove() bool {
	if !m.stopActiveAutoMove() {
		return false
	}
	m.pendingDoorAction = ""
	m.pendingMovementPrefix = ""
	m.pendingQuitConfirmation = false
	m.addMessage("automove canceled")
	return true
}

func (m *model) applySnapshot(snap snapshot) {
	setupWasComplete := m.setup.complete()
	if snap.world != nil {
		m.world = snap.world
	}
	if snap.inventory != nil {
		m.inventory = snap.inventory
	}
	if snap.roles != nil {
		m.roles = snap.roles
	}
	if snap.campground != nil {
		m.campground = *snap.campground
	}
	nextSetup := normalizeSetup(snap.setup)
	if !(m.setup.Phase == "complete" && !nextSetup.complete()) {
		m.setup = nextSetup
	}
	m.applyGameplayEvents(
		snap.gameplayEvents,
		!setupWasComplete && m.setup.complete(),
	)
}

func (m *model) applyGameplayEvents(events []gameplayEvent, setupJustCompleted bool) {
	for _, event := range events {
		if event.ID <= m.lastGameplayEventID {
			continue
		}
		if event.Kind == "arrival-narration" {
			if setupJustCompleted && strings.TrimSpace(event.Message) != "" {
				m.openingExposition = event.Message
			}
		} else {
			m.addMessage(event.Message)
		}
		m.lastGameplayEventID = event.ID
	}
}

func normalizeSetup(setup setupState) setupState {
	if strings.TrimSpace(setup.Phase) == "" {
		return setupState{Phase: "complete"}
	}
	return setup
}

func (m model) loadingInitialState() bool {
	return m.setup.Phase == "" && len(m.world) == 0 && len(m.roles) == 0 && len(m.inventory) == 0 && m.popup == nil
}

func (m model) readyForNormalPlay() bool {
	return m.setup.complete() && !m.loadingInitialState() && !m.setupPending
}

func (m model) needsSetupScreen() bool {
	return !m.readyForNormalPlay() || m.loadingInitialState()
}

func (m model) View() string {
	view := m.perf.measureString("frontend.view", "total", "", "", map[string]int{"worldSize": len(m.world), "inventorySize": len(m.inventory)}, func() string {
		if m.needsSetupScreen() {
			return m.perf.measureString("frontend.component", "setup", m.setup.Phase, "", map[string]int{"roleCount": len(m.roles)}, func() string {
				return renderSetupScreen(m.setup, m.roles, m.width, m.height, m.setupPending, m.messages)
			})
		}
		if strings.TrimSpace(m.openingExposition) != "" {
			return m.perf.measureString("frontend.component", "opening_exposition", "", "", nil, func() string {
				return renderOpeningExposition(m.openingExposition, m.width, m.height)
			})
		}

		cursorTarget := m.travelTarget
		if m.lookTarget != nil {
			cursorTarget = m.lookTarget
		}
		board := m.perf.measureString("frontend.component", "board", "", "", map[string]int{"worldSize": len(m.world)}, func() string {
			return renderBoardWithCampground(m.world, cursorTarget, m.campground)
		})
		sidebar := m.perf.measureString("frontend.component", "sidebar", "", "", map[string]int{"inventorySize": len(m.inventory)}, func() string {
			return renderSidebarArea(m.inventory, m.popup, m.landmarkPopup)
		})
		main := m.perf.measureString("frontend.component", "main_join", "", "", nil, func() string {
			if m.overviewOpen {
				return renderCampgroundOverview(m.campground)
			}
			return lipgloss.JoinHorizontal(lipgloss.Top, board, sidebar)
		})
		sections := []string{
			m.perf.measureString("frontend.component", "event", "", "", map[string]int{"messageCount": len(m.messages)}, func() string {
				return renderEventArea(m.world, m.messages, m.lookTarget, m.campground)
			}),
			main,
			m.perf.measureString("frontend.component", "status", "", "", map[string]int{"worldSize": len(m.world)}, func() string {
				return renderStatus(m.world, m.campground)
			}),
		}
		if m.popup != nil && m.popup.kind == popupDrop {
			sections = append(sections, m.perf.measureString("frontend.component", "popup", "drop", "", map[string]int{"itemCount": len(m.popup.items)}, func() string {
				return renderPopup(*m.popup)
			}))
		}
		sections = append(sections, helpStyle.Render("Flag Hack Charmbracelet UI · hjklyubn move · t talk · O overview · _ landmark/map travel · <> stairs · Shift/Ctrl/g/G/m/M run · o/c doors · ; look · , pickup · d drop · e eat · q quaff · M-l loot · #save/Ctrl-S · #quit/Ctrl-Q"))
		return lipgloss.JoinVertical(lipgloss.Left, sections...)
	})
	m.perf.finishRedraws()
	return view
}

func renderBoard(world []entity, target *pos) string {
	return renderTiles(drawWorld(world, target))
}

func renderBoardWithCampground(world []entity, target *pos, campground campgroundView) string {
	return renderTiles(drawWorldWithCampground(world, target, campground))
}

func renderTiles(tiles [][]tile) string {
	lines := make([]string, 0, boardHeight)
	for _, row := range tiles {
		var b strings.Builder
		for _, t := range row {
			style := lipgloss.NewStyle().Foreground(t.color)
			if t.bright {
				style = style.Bold(true)
			}
			b.WriteString(style.Render(t.char))
		}
		lines = append(lines, b.String())
	}
	return strings.Join(lines, "\n")
}

func renderSidebarArea(
	inventory []entity,
	popup *popupState,
	landmarkPopup *landmarkPopupState,
) string {
	if landmarkPopup != nil {
		return renderLandmarkPopup(*landmarkPopup)
	}
	if popup != nil && popup.kind != popupDrop {
		return renderSidebarPopup(*popup)
	}
	return renderSidebar(inventory)
}

func renderLandmarkPopup(popup landmarkPopupState) string {
	const pageSize = 8
	lines := []string{
		"travel where?",
		mutedStyle.Render("* - map cursor"),
	}
	entries := letteredLandmarks(popup.landmarks)
	if len(entries) == 0 {
		lines = append(lines, mutedStyle.Render("(no discovered destinations)"))
	}
	pageCount := landmarkPopupPageCount(len(entries))
	page := min(max(0, popup.page), pageCount-1)
	start := page * pageSize
	end := min(len(entries), start+pageSize)
	for _, entry := range entries[start:end] {
		label := "-"
		if entry.letter != "" {
			label = entry.letter
		}
		line := fmt.Sprintf("%s - %s", label, entry.landmark.Name)
		if !entry.landmark.TravelAvailable {
			line += " (unavailable)"
		}
		lines = append(lines, line)
	}
	if pageCount > 1 {
		lines = append(lines, mutedStyle.Render(fmt.Sprintf(
			"page %d/%d · [ ] change page",
			page+1,
			pageCount,
		)))
	}
	lines = append(lines, mutedStyle.Render("q/r/Esc cancels"))
	return sidebarStyle.Render(strings.Join(lines, "\n"))
}

func landmarkPopupPageCount(landmarkCount int) int {
	const pageSize = 8
	return max(1, (landmarkCount+pageSize-1)/pageSize)
}

func renderCampgroundOverview(view campgroundView) string {
	address := strings.TrimSpace(view.CurrentAddress)
	if address == "" {
		address = "unknown"
	}
	lines := []string{
		"Campground overview",
		"Current address: " + address,
	}
	if weather := campgroundWeatherLabel(view.Weather); weather != "" {
		lines = append(lines, "Weather: "+weather)
	}
	lines = append(lines, "", "Discovered destinations:")
	landmarks := sortedCampgroundLandmarks(view.DiscoveredLandmarks)
	if len(landmarks) == 0 {
		lines = append(lines, "  (none yet)")
	}
	for _, landmark := range landmarks {
		travel := ""
		if landmark.TravelAvailable {
			travel = " [travel]"
		}
		lines = append(lines, fmt.Sprintf(
			"  - %s (%s) — %s%s",
			landmark.Name,
			landmark.Kind,
			landmark.Address,
			travel,
		))
	}
	if view.ActiveEvent != nil {
		lines = append(lines, "", fmt.Sprintf(
			"Active event: %s (%s) at %s",
			view.ActiveEvent.Name,
			view.ActiveEvent.Kind,
			view.ActiveEvent.LandmarkID,
		))
	}
	lines = append(
		lines,
		"",
		"Legend: @ you  # road  ? sign  Y effigy  Ω temple  < > stairs",
		"Props: G gate  A art  | flagpole  = stage  W bench  B bikes",
		"       D directory  ~ water  S speaker  L lantern  T table",
		mutedStyle.Render("O/q/Esc closes · _ chooses a destination"),
	)
	return messageStyle.Width(118).Render(strings.Join(lines, "\n"))
}

func renderSidebar(inventory []entity) string {
	lines := []string{"inventory"}
	if len(inventory) == 0 {
		lines = append(lines, mutedStyle.Render("(empty)"))
	} else {
		for _, entry := range letteredItems(inventory) {
			lines = append(lines, renderLetteredItem(entry, false, false))
		}
	}
	return sidebarStyle.Render(strings.Join(lines, "\n"))
}

func renderLetteredItem(entry letteredItem, marked bool, bracketed bool) string {
	label := "-"
	if entry.letter != "" {
		label = entry.letter
	}
	line := fmt.Sprintf("%s - %s", label, entry.item.Tag)
	if marked {
		line = selectedStyle.Render(line)
	}
	if bracketed {
		if marked {
			return "[x] " + line
		}
		return "[ ] " + line
	}
	if marked {
		return "* " + line
	}
	return "  " + line
}

func fixedEventLines(lines []string) []string {
	fixed := make([]string, 0, fixedEventAreaLines)
	limit := min(len(lines), fixedEventAreaLines)
	fixed = append(fixed, lines[:limit]...)
	for len(fixed) < fixedEventAreaLines {
		fixed = append(fixed, "")
	}
	return fixed
}

func renderEventArea(
	world []entity,
	messages []string,
	lookTarget *pos,
	campground campgroundView,
) string {
	if lookTarget != nil {
		return renderLookPanel(world, *lookTarget, campground)
	}
	return renderMessages(messages)
}

func renderMessages(messages []string) string {
	return messageStyle.Width(118).Render(strings.Join(fixedEventLines(messages), "\n"))
}

func renderLookPanel(
	world []entity,
	target pos,
	campground campgroundView,
) string {
	lines := []string{
		describeLookTargetWithCampground(world, target, campground),
		mutedStyle.Render("hjkl/yubn move look cursor, Esc exits look mode"),
	}
	if address := strings.TrimSpace(campground.CurrentAddress); address != "" {
		lines = append(lines, "Address: "+address)
	}
	return messageStyle.Width(118).Render(strings.Join(fixedEventLines(lines), "\n"))
}

func renderStatus(world []entity, campgroundViews ...campgroundView) string {
	name := "player"
	dungeonLevel := "?"
	attributeLine := "St:-- Dx:-- Co:-- In:-- Wi:-- Ch:--  HP:--/--  Pw:--/--"
	if player, ok := findPlayer(world); ok {
		if candidate := strings.TrimSpace(player.Name); candidate != "" {
			name = candidate
		}
		if player.Attributes != nil {
			attributeLine = formatAttributeStatus(*player.Attributes) + "  HP:--/--  Pw:--/--"
		}
		if player.At.Z == 0 {
			dungeonLevel = "burn"
		} else {
			dungeonLevel = fmt.Sprintf("%d", player.At.Z)
		}
	}
	lines := []string{
		"Player: " + name,
		attributeLine,
		"AC:--  Dlvl:" + dungeonLevel,
	}
	if len(campgroundViews) > 0 {
		campground := campgroundViews[0]
		if weather := campgroundWeatherLabel(campground.Weather); weather != "" {
			lines = append(lines, "Weather: "+weather)
		}
	}
	return statusStyle.Render(strings.Join(lines, "\n"))
}

func campgroundWeatherLabel(weather *campgroundWeather) string {
	if weather == nil {
		return ""
	}
	switch weather.Condition {
	case "heavy-rain":
		return "heavy rain"
	default:
		return strings.TrimSpace(weather.Condition)
	}
}

func formatAttributeStatus(a attributes) string {
	return fmt.Sprintf(
		"St:%d Dx:%d Co:%d In:%d Wi:%d Ch:%d",
		a.Strength,
		a.Dexterity,
		a.Constitution,
		a.Intelligence,
		a.Wisdom,
		a.Charisma,
	)
}

func renderPopup(popup popupState) string {
	instructions := "letters toggle, , marks all, space submits, q/r/Esc cancels"
	if popupIsSingleItemAction(popup.kind) {
		instructions = "letter selects immediately, q/r/Esc cancels"
	}
	lines := []string{popup.title, mutedStyle.Render(instructions)}
	if popup.stage == popupStageAction {
		lines = append(lines, "t - take", "p - put")
		return popupStyle.Render(strings.Join(lines, "\n"))
	}
	items := popupVisibleItems(popup)
	if len(items) == 0 {
		lines = append(lines, mutedStyle.Render("(nothing available)"))
	} else {
		for _, entry := range letteredItems(items) {
			single := popupIsSingleItemAction(popup.kind)
			lines = append(lines, renderLetteredItem(entry, !single && popup.marked[entry.item.Key], !single))
		}
	}
	return popupStyle.Render(strings.Join(lines, "\n"))
}

func renderSetupScreen(setup setupState, roles []role, width int, height int, pending bool, messages []string) string {
	if width <= 0 {
		width = 120
	}
	if height <= 0 {
		height = 30
	}
	content := renderSetupBox(setup, roles, pending)
	if len(messages) > 0 {
		content = lipgloss.JoinVertical(lipgloss.Left, content, renderMessages(messages))
	}
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, content)
}

func renderOpeningExposition(message string, width int, height int) string {
	if width <= 0 {
		width = 120
	}
	if height <= 0 {
		height = 30
	}
	paneWidth := min(72, max(34, width-4))
	content := expositionStyle.Width(paneWidth).Render(strings.Join([]string{
		lipgloss.NewStyle().Bold(true).Render("You wake in the mud"),
		"",
		strings.TrimSpace(message),
		"",
		"You are carrying nothing.",
		"",
		mutedStyle.Render("Enter/Space continues · Esc closes"),
	}, "\n"))
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, content)
}

func renderSetupBox(setup setupState, roles []role, pending bool) string {
	if setup.Phase == "" {
		return setupStyle.Render("Loading game...")
	}
	if setup.Phase == "confirm" {
		selected, ok := roleForID(roles, setup.SelectedRoleID)
		roleLine := setup.SelectedRoleID
		if ok {
			roleLine = fmt.Sprintf("%s - %s", selected.Letter, selected.Name)
		}
		lines := []string{
			"You are a " + roleNameForSetup(selected, ok),
			"",
			roleLine,
		}
		if pending {
			lines = append(lines, "", mutedStyle.Render("Working..."))
		} else {
			lines = append(lines, "", "Is this ok? [yn]")
		}
		return setupStyle.Render(strings.Join(lines, "\n"))
	}

	lines := []string{"Choose a role", ""}
	if len(roles) == 0 {
		lines = append(lines, mutedStyle.Render("(no roles available)"))
	} else {
		for _, entry := range sortedRoles(roles) {
			lines = append(lines, fmt.Sprintf("%s - %s", entry.Letter, entry.Name))
		}
	}
	if pending {
		lines = append(lines, "", mutedStyle.Render("Working..."))
	}
	return setupStyle.Render(strings.Join(lines, "\n"))
}

func roleNameForSetup(selected role, ok bool) string {
	if !ok || strings.TrimSpace(selected.Name) == "" {
		return "?"
	}
	return selected.Name
}

func sortedRoles(roles []role) []role {
	sorted := append([]role(nil), roles...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Letter < sorted[j].Letter
	})
	return sorted
}

func roleForLetter(roles []role, letter string) (role, bool) {
	for _, candidate := range roles {
		if strings.EqualFold(candidate.Letter, letter) {
			return candidate, true
		}
	}
	return role{}, false
}

func roleForID(roles []role, id string) (role, bool) {
	for _, candidate := range roles {
		if candidate.ID == id {
			return candidate, true
		}
	}
	return role{}, false
}

func renderSidebarPopup(popup popupState) string {
	lines := []string{popup.title}
	if popup.kind == popupLoot && popup.stage == popupStageAction {
		lines = append(lines, mutedStyle.Render("choose action"), "t - take", "p - put", mutedStyle.Render("q/r/Esc cancels"))
		return sidebarStyle.Render(strings.Join(lines, "\n"))
	}
	if popupIsSingleItemAction(popup.kind) {
		lines = append(lines, mutedStyle.Render("letter selects immediately · q/r/Esc cancels"))
	} else if popup.kind == popupLoot {
		modeLabel := "take"
		if popup.mode == lootPut {
			modeLabel = "put"
		}
		lines = append(lines, modeLabel, mutedStyle.Render("letters toggle · , all · space ok · Esc cancels"))
	} else {
		lines = append(lines, mutedStyle.Render("letters toggle · , all · space ok · Esc cancels"))
	}
	items := popupVisibleItems(popup)
	if len(items) == 0 {
		if popup.kind == popupLoot && popup.mode == lootPut {
			lines = append(lines, mutedStyle.Render("(inventory empty)"))
		} else {
			lines = append(lines, mutedStyle.Render("(nothing available)"))
		}
	} else {
		for _, entry := range letteredItems(items) {
			single := popupIsSingleItemAction(popup.kind)
			lines = append(lines, renderLetteredItem(entry, !single && popup.marked[entry.item.Key], false))
		}
	}
	return sidebarStyle.Render(strings.Join(lines, "\n"))
}

func loadStateCmd(client apiClient) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.loadState")
	return func() tea.Msg {
		snap, err := client.loadState(context.Background())
		return stateLoadedMsg{snapshot: snap, err: err, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func openClientStateStreamCmd(client apiClient) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.stream.open")
	return func() tea.Msg {
		stream, err := client.openClientStateStreamWithTimeout(context.Background(), 10*time.Second)
		if err != nil {
			return clientStateStreamMsg{err: err, initial: true, perfTraceID: traceID, responseReceived: time.Now()}
		}
		timer := time.NewTimer(10 * time.Second)
		defer timer.Stop()
		var result clientStateStreamResult
		var ok bool
		select {
		case result, ok = <-stream.events:
		case <-timer.C:
			stream.cancel()
			return clientStateStreamMsg{err: fmt.Errorf("timed out waiting for initial client-state stream event"), initial: true, perfTraceID: traceID, responseReceived: time.Now()}
		}
		if !ok {
			stream.cancel()
			return clientStateStreamMsg{err: fmt.Errorf("client-state stream closed before initial event"), initial: true, perfTraceID: traceID, responseReceived: time.Now()}
		}
		if result.err != nil {
			stream.cancel()
			return clientStateStreamMsg{err: result.err, initial: true, perfTraceID: traceID, responseReceived: time.Now()}
		}
		return clientStateStreamMsg{stream: stream, event: result.event, initial: true, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func nextClientStateStreamEventCmd(stream *clientStateStream) tea.Cmd {
	return func() tea.Msg {
		result, ok := <-stream.events
		if !ok {
			return clientStateStreamMsg{stream: stream, err: fmt.Errorf("client-state stream closed"), responseReceived: time.Now()}
		}
		return clientStateStreamMsg{stream: stream, event: result.event, err: result.err, responseReceived: time.Now()}
	}
}

func selectRoleCmd(client apiClient, roleID string, requestID int) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.setup.role")
	return func() tea.Msg {
		snap, err := client.selectRoleAndRefresh(context.Background(), roleID)
		return setupDoneMsg{snapshot: snap, err: err, caseName: "role", perfTraceID: traceID, requestID: requestID, responseReceived: time.Now()}
	}
}

func confirmSetupCmd(client apiClient, roleID string, confirm bool, requestID int) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.setup.confirm")
	return func() tea.Msg {
		snap, err := client.confirmSetupAndRefresh(context.Background(), roleID, confirm)
		return setupDoneMsg{snapshot: snap, err: err, caseName: "confirm", perfTraceID: traceID, requestID: requestID, responseReceived: time.Now()}
	}
}

func loadPickupCmd(client apiClient, requestID int) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.pickup")
	return func() tea.Msg {
		items, err := client.getPickupItemsFor(context.Background(), "player")
		return pickupLoadedMsg{requestID: requestID, items: items, err: err, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func loadLootContainersCmd(client apiClient, requestID int) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.lootContainers")
	return func() tea.Msg {
		containers, err := client.getLootContainersFor(context.Background(), "player")
		return lootContainersLoadedMsg{requestID: requestID, containers: containers, err: err, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func loadLootItemsCmd(client apiClient, requestID int, containerKey string) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.lootItems")
	return func() tea.Msg {
		items, err := client.getLootItemsFor(context.Background(), "player", containerKey)
		return lootItemsLoadedMsg{requestID: requestID, items: items, err: err, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func actionCmd(client apiClient, act action, streamActive bool) tea.Cmd {
	if streamActive {
		return actionOnlyCmd(client, act)
	}
	return actionAndRefreshCmd(client, act)
}

func actionOnlyCmd(client apiClient, act action) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.action")
	return func() tea.Msg {
		err := client.actionOnly(context.Background(), act)
		return actionDoneMsg{err: err, caseName: act.Tag, perfTraceID: traceID, responseReceived: time.Now(), streamed: true}
	}
}

func actionAndRefreshCmd(client apiClient, act action) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.action")
	return func() tea.Msg {
		snap, err := client.actionAndRefresh(context.Background(), act)
		return actionDoneMsg{snapshot: snap, err: err, caseName: act.Tag, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func saveGameCmd(client apiClient) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.save")
	return func() tea.Msg {
		err := client.saveGame(context.Background())
		return saveDoneMsg{err: err, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func quitGameCmd(client apiClient) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.quit")
	return func() tea.Msg {
		err := client.quitGame(context.Background())
		return quitDoneMsg{err: err, perfTraceID: traceID, responseReceived: time.Now()}
	}
}

func (c apiClient) loadState(ctx context.Context) (snapshot, error) {
	return measurePerfCall(c.perf, "frontend.api", "loadState", "", "", nil, func() (snapshot, error) {
		return c.getClientState(ctx)
	})
}

func (c apiClient) actionAndRefresh(ctx context.Context, act action) (snapshot, error) {
	return measurePerfCall(c.perf, "frontend.api", "actionAndRefresh", act.Tag, "", nil, func() (snapshot, error) {
		if err := c.doAction(ctx, act); err != nil {
			return snapshot{}, err
		}
		return c.getClientState(ctx)
	})
}

func (c apiClient) actionOnly(ctx context.Context, act action) error {
	_, err := measurePerfCall(c.perf, "frontend.api", "action", act.Tag, "", nil, func() (struct{}, error) {
		if err := c.doAction(ctx, act); err != nil {
			return struct{}{}, err
		}
		return struct{}{}, nil
	})
	return err
}

func (c apiClient) selectRoleAndRefresh(ctx context.Context, roleID string) (snapshot, error) {
	return measurePerfCall(c.perf, "frontend.api", "selectRoleAndRefresh", roleID, "", nil, func() (snapshot, error) {
		if err := c.selectRole(ctx, roleID); err != nil {
			return snapshot{}, err
		}
		return c.getClientState(ctx)
	})
}

func (c apiClient) confirmSetupAndRefresh(ctx context.Context, roleID string, confirm bool) (snapshot, error) {
	return measurePerfCall(c.perf, "frontend.api", "confirmSetupAndRefresh", fmt.Sprintf("%t", confirm), "", nil, func() (snapshot, error) {
		if confirm && roleID != "" {
			if err := c.selectRole(ctx, roleID); err != nil {
				return snapshot{}, err
			}
		}
		if err := c.confirmSetup(ctx, confirm); err != nil {
			return snapshot{}, err
		}
		return c.getClientState(ctx)
	})
}

func (c apiClient) runDirectionalMovement(ctx context.Context, initialWorld []entity, command moveCommand, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	measured, err := measurePerfCall(c.perf, "frontend.api", "runDirectionalMovement", command.tag, "", nil, func() (autoRunSnapshot, error) {
		result, snap, err := c.runDirectionalMovementUnmeasured(ctx, initialWorld, command, cancel)
		return autoRunSnapshot{result: result, snapshot: snap}, err
	})
	return measured.result, measured.snapshot, err
}

func (c apiClient) runDirectionalMovementUnmeasured(ctx context.Context, initialWorld []entity, command moveCommand, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	label := commandLabel(command)
	world := initialWorld
	currentDirection := command.dir
	var previousPosition *pos
	turnAccumulator := 0
	steps := 0
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, snapshot{}, nil
		}
		before, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, snapshot{}, nil
		}
		if steps > 0 && shouldStopAtCorridorBoundary(command, currentDirection, world, before.At, previousPosition) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, snapshot{world: world}, nil
		}
		snap, err := c.actionAndRefresh(ctx, action{Tag: "move", Dir: currentDirection})
		if err != nil {
			return autoRunResult{label: label, kind: "error", steps: steps}, snapshot{}, err
		}
		world = snap.world
		after, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, snap, nil
		}
		if samePos(before.At, after.At) {
			return autoRunResult{label: label, kind: "blocked", steps: steps}, snap, nil
		}
		steps++
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, snap, nil
		}
		if shouldStopDirectionalRun(command, currentDirection, world, after.At, before.At) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, snap, nil
		}
		next := nextDirectionalRunDirection(command, currentDirection, world, after.At, before.At, turnAccumulator)
		previous := before.At
		previousPosition = &previous
		currentDirection = next.direction
		turnAccumulator = next.turnAccumulator
	}
	return autoRunResult{label: label, kind: "too-far", steps: steps}, snapshot{world: world}, nil
}

func (c apiClient) runDirectionalMovementStreamed(ctx context.Context, initialWorld []entity, command moveCommand, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	measured, err := measurePerfCall(c.perf, "frontend.api", "runDirectionalMovement", command.tag, "stream", nil, func() (autoRunSnapshot, error) {
		result, snap, err := c.runDirectionalMovementStreamedUnmeasured(ctx, initialWorld, command, cancel)
		return autoRunSnapshot{result: result, snapshot: snap}, err
	})
	return measured.result, measured.snapshot, err
}

func (c apiClient) runDirectionalMovementStreamedUnmeasured(ctx context.Context, initialWorld []entity, command moveCommand, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	stream, err := c.openClientStateStreamWithTimeout(ctx, 10*time.Second)
	if err != nil {
		return autoRunResult{label: commandLabel(command), kind: "error", steps: 0}, snapshot{}, err
	}
	defer stream.cancel()

	initialSnap, lastRevision, wasCancelled, err := waitForStreamSnapshot(ctx, stream, cancel, -1)
	if err != nil {
		return autoRunResult{label: commandLabel(command), kind: "error", steps: 0}, snapshot{}, err
	}
	if wasCancelled {
		return autoRunResult{label: commandLabel(command), kind: "cancelled", steps: 0}, snapshot{world: initialWorld}, nil
	}

	label := commandLabel(command)
	world := initialSnap.world
	if world == nil {
		world = initialWorld
	}
	currentDirection := command.dir
	var previousPosition *pos
	turnAccumulator := 0
	steps := 0
	latest := initialSnap
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		before, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, latest, nil
		}
		if steps > 0 && shouldStopAtCorridorBoundary(command, currentDirection, world, before.At, previousPosition) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, latest, nil
		}
		if err := c.actionOnly(ctx, action{Tag: "move", Dir: currentDirection}); err != nil {
			return autoRunResult{label: label, kind: "error", steps: steps}, snapshot{}, err
		}
		nextSnap, nextRevision, wasCancelled, err := waitForStreamSnapshot(ctx, stream, cancel, lastRevision)
		if err != nil {
			return autoRunResult{label: label, kind: "error", steps: steps}, snapshot{}, err
		}
		if wasCancelled {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		lastRevision = nextRevision
		latest = nextSnap
		world = nextSnap.world
		after, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, latest, nil
		}
		if samePos(before.At, after.At) {
			return autoRunResult{label: label, kind: "blocked", steps: steps}, latest, nil
		}
		steps++
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		if shouldStopDirectionalRun(command, currentDirection, world, after.At, before.At) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, latest, nil
		}
		next := nextDirectionalRunDirection(command, currentDirection, world, after.At, before.At, turnAccumulator)
		previous := before.At
		previousPosition = &previous
		currentDirection = next.direction
		turnAccumulator = next.turnAccumulator
	}
	return autoRunResult{label: label, kind: "too-far", steps: steps}, latest, nil
}

func (c apiClient) runTravel(ctx context.Context, initialWorld []entity, target pos, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	return c.runTravelFromBaseline(ctx, initialWorld, target, 0, cancel)
}

func (c apiClient) runTravelFromBaseline(ctx context.Context, initialWorld []entity, target pos, baselineEventID int, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	measured, err := measurePerfCall(c.perf, "frontend.api", "runTravel", "travel", "", nil, func() (autoRunSnapshot, error) {
		result, snap, err := c.runTravelUnmeasuredFromBaseline(ctx, initialWorld, target, baselineEventID, cancel)
		return autoRunSnapshot{result: result, snapshot: snap}, err
	})
	return measured.result, measured.snapshot, err
}

func (c apiClient) runTravelUnmeasured(ctx context.Context, initialWorld []entity, target pos, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	return c.runTravelUnmeasuredFromBaseline(ctx, initialWorld, target, 0, cancel)
}

func (c apiClient) runTravelUnmeasuredFromBaseline(ctx context.Context, initialWorld []entity, target pos, baselineEventID int, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	world := initialWorld
	latest := snapshot{world: world}
	steps := 0
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, latest, nil
		}
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: "travel", kind: "interesting", steps: steps}, latest, nil
		}
		player, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: "travel", kind: "player-not-found", steps: steps}, latest, nil
		}
		if samePos(player.At, target) {
			return autoRunResult{label: "travel", kind: "arrived", steps: steps}, latest, nil
		}
		path := findTravelDirections(world, player.At, target)
		if len(path) == 0 {
			return autoRunResult{label: "travel", kind: "blocked", steps: steps}, latest, nil
		}

		batch := straightTravelBatch(path, maxAutoMoveSteps-steps)
		before := player.At
		expected := before
		for _, direction := range batch {
			if cancelled(cancel) {
				return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, latest, nil
			}
			if err := c.doAction(ctx, action{Tag: "move", Dir: direction}); err != nil {
				return autoRunResult{label: "travel", kind: "error", steps: steps}, snapshot{}, err
			}
			steps++
			expected = addPos(expected, movementDeltas[direction])
			if cancelled(cancel) {
				refreshed, err := c.getClientState(ctx)
				if err != nil {
					return autoRunResult{label: "travel", kind: "error", steps: steps}, snapshot{}, err
				}
				return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, refreshed, nil
			}
		}

		refreshed, err := c.getClientState(ctx)
		if err != nil {
			return autoRunResult{label: "travel", kind: "error", steps: steps}, snapshot{}, err
		}
		world = refreshed.world
		latest = refreshed
		if cancelled(cancel) {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, refreshed, nil
		}
		if hasNewInterruptingGameplayEvent(refreshed.gameplayEvents, baselineEventID) {
			return autoRunResult{label: "travel", kind: "interesting", steps: steps}, refreshed, nil
		}
		after, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: "travel", kind: "player-not-found", steps: steps}, refreshed, nil
		}
		if samePos(after.At, target) {
			return autoRunResult{label: "travel", kind: "arrived", steps: steps}, refreshed, nil
		}
		if samePos(before, after.At) || !samePos(expected, after.At) {
			return autoRunResult{label: "travel", kind: "blocked", steps: steps}, refreshed, nil
		}
	}
	return autoRunResult{label: "travel", kind: "too-far", steps: steps}, latest, nil
}

func (c apiClient) runTravelStreamed(ctx context.Context, initialWorld []entity, target pos, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	return c.runTravelStreamedFromBaseline(ctx, initialWorld, target, 0, cancel)
}

func (c apiClient) runTravelStreamedFromBaseline(ctx context.Context, initialWorld []entity, target pos, baselineEventID int, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	measured, err := measurePerfCall(c.perf, "frontend.api", "runTravel", "travel", "stream", nil, func() (autoRunSnapshot, error) {
		result, snap, err := c.runTravelStreamedUnmeasuredFromBaseline(ctx, initialWorld, target, baselineEventID, cancel)
		return autoRunSnapshot{result: result, snapshot: snap}, err
	})
	return measured.result, measured.snapshot, err
}

func (c apiClient) runTravelStreamedUnmeasured(ctx context.Context, initialWorld []entity, target pos, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	return c.runTravelStreamedUnmeasuredFromBaseline(ctx, initialWorld, target, 0, cancel)
}

func (c apiClient) runTravelStreamedUnmeasuredFromBaseline(ctx context.Context, initialWorld []entity, target pos, baselineEventID int, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	stream, err := c.openClientStateStreamWithTimeout(ctx, 10*time.Second)
	if err != nil {
		return autoRunResult{label: "travel", kind: "error", steps: 0}, snapshot{}, err
	}
	defer stream.cancel()

	initialSnap, lastRevision, wasCancelled, err := waitForStreamSnapshot(ctx, stream, cancel, -1)
	if err != nil {
		return autoRunResult{label: "travel", kind: "error", steps: 0}, snapshot{}, err
	}
	if wasCancelled {
		return autoRunResult{label: "travel", kind: "cancelled", steps: 0}, snapshot{world: initialWorld}, nil
	}

	world := initialSnap.world
	if world == nil {
		world = initialWorld
	}
	latest := initialSnap
	steps := 0
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, latest, nil
		}
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: "travel", kind: "interesting", steps: steps}, latest, nil
		}
		player, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: "travel", kind: "player-not-found", steps: steps}, latest, nil
		}
		if samePos(player.At, target) {
			return autoRunResult{label: "travel", kind: "arrived", steps: steps}, latest, nil
		}
		path := findTravelDirections(world, player.At, target)
		if len(path) == 0 {
			return autoRunResult{label: "travel", kind: "blocked", steps: steps}, latest, nil
		}

		before := player.At
		direction := path[0]
		if err := c.actionOnly(ctx, action{Tag: "move", Dir: direction}); err != nil {
			return autoRunResult{label: "travel", kind: "error", steps: steps}, snapshot{}, err
		}
		steps++
		nextSnap, nextRevision, wasCancelled, err := waitForStreamSnapshot(ctx, stream, cancel, lastRevision)
		if err != nil {
			return autoRunResult{label: "travel", kind: "error", steps: steps}, snapshot{}, err
		}
		if wasCancelled {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, latest, nil
		}
		lastRevision = nextRevision
		latest = nextSnap
		world = nextSnap.world
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: "travel", kind: "interesting", steps: steps}, latest, nil
		}
		after, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: "travel", kind: "player-not-found", steps: steps}, latest, nil
		}
		if samePos(after.At, target) {
			return autoRunResult{label: "travel", kind: "arrived", steps: steps}, latest, nil
		}
		expected := addPos(before, movementDeltas[direction])
		if samePos(before, after.At) || !samePos(expected, after.At) {
			return autoRunResult{label: "travel", kind: "blocked", steps: steps}, latest, nil
		}
	}
	return autoRunResult{label: "travel", kind: "too-far", steps: steps}, latest, nil
}

func (c apiClient) runLandmarkTravel(
	ctx context.Context,
	initial snapshot,
	landmarkID string,
	baselineEventID int,
	cancel <-chan struct{},
	preferStream bool,
) (autoRunResult, snapshot, error) {
	if preferStream {
		result, snap, err := c.runLandmarkTravelStreamed(
			ctx,
			initial,
			landmarkID,
			baselineEventID,
			cancel,
		)
		if err == nil || result.steps > 0 {
			return result, snap, err
		}
	}
	return c.runLandmarkTravelPolling(
		ctx,
		initial,
		landmarkID,
		baselineEventID,
		cancel,
	)
}

func (c apiClient) runLandmarkTravelPolling(
	ctx context.Context,
	initial snapshot,
	landmarkID string,
	baselineEventID int,
	cancel <-chan struct{},
) (autoRunResult, snapshot, error) {
	latest := initial
	label := landmarkTravelLabel(initial, landmarkID)
	steps := 0
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, latest, nil
		}
		before, ok := findPlayer(latest.world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, latest, nil
		}
		if landmarkReached(latest, landmarkID) {
			return autoRunResult{label: label, kind: "arrived", steps: steps}, latest, nil
		}
		destination, ok := landmarkInView(latest, landmarkID)
		if !ok || !destination.TravelAvailable {
			return autoRunResult{label: label, kind: "blocked", steps: steps}, latest, nil
		}

		next, err := c.actionAndRefresh(ctx, action{
			Tag:        "travelStep",
			LandmarkID: landmarkID,
		})
		if err != nil {
			return autoRunResult{label: label, kind: "error", steps: steps}, snapshot{}, err
		}
		steps++
		latest = snapshotWithFallback(next, latest)
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, latest, nil
		}
		after, ok := findPlayer(latest.world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, latest, nil
		}
		if landmarkReached(latest, landmarkID) {
			return autoRunResult{label: label, kind: "arrived", steps: steps}, latest, nil
		}
		if samePos(before.At, after.At) {
			return autoRunResult{label: label, kind: "blocked", steps: steps}, latest, nil
		}
	}
	return autoRunResult{label: label, kind: "too-far", steps: steps}, latest, nil
}

func (c apiClient) runLandmarkTravelStreamed(
	ctx context.Context,
	initial snapshot,
	landmarkID string,
	baselineEventID int,
	cancel <-chan struct{},
) (autoRunResult, snapshot, error) {
	label := landmarkTravelLabel(initial, landmarkID)
	stream, err := c.openClientStateStreamWithTimeout(ctx, 10*time.Second)
	if err != nil {
		return autoRunResult{label: label, kind: "error"}, snapshot{}, err
	}
	defer stream.cancel()

	latest, lastRevision, wasCancelled, err := waitForStreamSnapshot(
		ctx,
		stream,
		cancel,
		-1,
	)
	if err != nil {
		return autoRunResult{label: label, kind: "error"}, snapshot{}, err
	}
	latest = snapshotWithFallback(latest, initial)
	if wasCancelled {
		return autoRunResult{label: label, kind: "cancelled"}, latest, nil
	}

	steps := 0
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, latest, nil
		}
		before, ok := findPlayer(latest.world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, latest, nil
		}
		if landmarkReached(latest, landmarkID) {
			return autoRunResult{label: label, kind: "arrived", steps: steps}, latest, nil
		}
		destination, ok := landmarkInView(latest, landmarkID)
		if !ok || !destination.TravelAvailable {
			return autoRunResult{label: label, kind: "blocked", steps: steps}, latest, nil
		}
		if err := c.actionOnly(ctx, action{
			Tag:        "travelStep",
			LandmarkID: landmarkID,
		}); err != nil {
			return autoRunResult{label: label, kind: "error", steps: steps}, snapshot{}, err
		}
		steps++
		next, nextRevision, wasCancelled, err := waitForStreamSnapshot(
			ctx,
			stream,
			cancel,
			lastRevision,
		)
		if err != nil {
			return autoRunResult{label: label, kind: "error", steps: steps}, snapshot{}, err
		}
		if wasCancelled {
			return autoRunResult{label: label, kind: "cancelled", steps: steps}, latest, nil
		}
		lastRevision = nextRevision
		latest = snapshotWithFallback(next, latest)
		if hasNewInterruptingGameplayEvent(latest.gameplayEvents, baselineEventID) {
			return autoRunResult{label: label, kind: "interesting", steps: steps}, latest, nil
		}
		after, ok := findPlayer(latest.world)
		if !ok {
			return autoRunResult{label: label, kind: "player-not-found", steps: steps}, latest, nil
		}
		if landmarkReached(latest, landmarkID) {
			return autoRunResult{label: label, kind: "arrived", steps: steps}, latest, nil
		}
		if samePos(before.At, after.At) {
			return autoRunResult{label: label, kind: "blocked", steps: steps}, latest, nil
		}
	}
	return autoRunResult{label: label, kind: "too-far", steps: steps}, latest, nil
}

func snapshotWithFallback(next snapshot, previous snapshot) snapshot {
	if next.world == nil {
		next.world = previous.world
	}
	if next.inventory == nil {
		next.inventory = previous.inventory
	}
	if next.roles == nil {
		next.roles = previous.roles
	}
	if next.campground == nil {
		next.campground = previous.campground
	}
	if next.gameplayEvents == nil {
		next.gameplayEvents = previous.gameplayEvents
	}
	return next
}

func maxGameplayEventID(events []gameplayEvent) int {
	maximum := 0
	for _, event := range events {
		maximum = max(maximum, event.ID)
	}
	return maximum
}

func maxInterruptingGameplayEventID(events []gameplayEvent) int {
	maximum := 0
	for _, event := range events {
		if event.InterruptsTravel == nil || *event.InterruptsTravel {
			maximum = max(maximum, event.ID)
		}
	}
	return maximum
}

func hasNewInterruptingGameplayEvent(events []gameplayEvent, baselineEventID int) bool {
	return maxInterruptingGameplayEventID(events) > baselineEventID
}

func landmarkInView(
	snap snapshot,
	landmarkID string,
) (campgroundLandmark, bool) {
	if snap.campground == nil {
		return campgroundLandmark{}, false
	}
	for _, landmark := range snap.campground.DiscoveredLandmarks {
		if landmark.ID == landmarkID {
			return landmark, true
		}
	}
	return campgroundLandmark{}, false
}

func landmarkReached(snap snapshot, landmarkID string) bool {
	landmark, ok := landmarkInView(snap, landmarkID)
	if !ok {
		return false
	}
	player, ok := findPlayer(snap.world)
	if ok && samePos(player.At, landmark.At) {
		return true
	}
	return snap.campground != nil &&
		!landmark.TravelAvailable &&
		strings.TrimSpace(landmark.Address) != "" &&
		snap.campground.CurrentAddress == landmark.Address
}

func landmarkTravelLabel(snap snapshot, landmarkID string) string {
	landmark, ok := landmarkInView(snap, landmarkID)
	if ok && strings.TrimSpace(landmark.Name) != "" {
		return "travel to " + landmark.Name
	}
	return "landmark travel"
}

func straightTravelBatch(path []string, remainingSteps int) []string {
	if len(path) == 0 || remainingSteps <= 0 {
		return nil
	}
	firstDirection := path[0]
	limit := min(min(len(path), remainingSteps), travelWorldRefreshInterval)
	batch := make([]string, 0, limit)
	for _, direction := range path[:limit] {
		if direction != firstDirection {
			break
		}
		batch = append(batch, direction)
	}
	return batch
}

func cancelled(cancel <-chan struct{}) bool {
	select {
	case <-cancel:
		return true
	default:
		return false
	}
}

func (c apiClient) getPickupItemsFor(ctx context.Context, key string) ([]entity, error) {
	return c.getCollection(ctx, "/getPickupFor?key="+url.QueryEscape(key))
}

func (c apiClient) getLootContainersFor(ctx context.Context, key string) ([]entity, error) {
	return c.getCollection(ctx, "/loot/containersFor?key="+url.QueryEscape(key))
}

func (c apiClient) getLootItemsFor(ctx context.Context, key string, containerKey string) ([]entity, error) {
	path := "/loot/itemsFor?key=" + url.QueryEscape(key) + "&containerKey=" + url.QueryEscape(containerKey)
	return c.getCollection(ctx, path)
}

func (c apiClient) getClientState(ctx context.Context) (snapshot, error) {
	return measurePerfCall(c.perf, "frontend.http", "GET", "/client-state", "", nil, func() (snapshot, error) {
		var raw clientStateResponse
		if err := c.getJSON(ctx, "/client-state", &raw); err != nil {
			return snapshot{}, err
		}
		return raw.snapshot()
	})
}

func (event clientStateStreamEvent) snapshot() (snapshot, error) {
	return event.ClientState.snapshot()
}

func (raw clientStateResponse) snapshot() (snapshot, error) {
	world, err := decodeEntityPairs(raw.World)
	if err != nil {
		return snapshot{}, err
	}
	inventory, err := decodeEntityPairs(raw.Inventory)
	if err != nil {
		return snapshot{}, err
	}
	return snapshot{
		world:          world,
		inventory:      inventory,
		roles:          raw.Roles,
		setup:          normalizeSetup(raw.Setup),
		gameplayEvents: raw.GameplayEvents,
		campground:     &raw.Campground,
	}, nil
}

type openClientStateStreamResult struct {
	stream *clientStateStream
	err    error
}

func (c apiClient) openClientStateStreamWithTimeout(ctx context.Context, timeout time.Duration) (*clientStateStream, error) {
	openCtx, cancel := context.WithCancel(ctx)
	results := make(chan openClientStateStreamResult, 1)
	go func() {
		stream, err := c.openClientStateStream(openCtx)
		results <- openClientStateStreamResult{stream: stream, err: err}
	}()

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		cancel()
		return nil, ctx.Err()
	case <-timer.C:
		cancel()
		return nil, fmt.Errorf("timed out opening client-state stream")
	case result := <-results:
		if result.err != nil {
			cancel()
			return nil, result.err
		}
		originalCancel := result.stream.cancel
		result.stream.cancel = func() {
			originalCancel()
			cancel()
		}
		return result.stream, nil
	}
}

func (c apiClient) openClientStateStream(ctx context.Context) (*clientStateStream, error) {
	ctx, cancel := context.WithCancel(ctx)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+clientStateStreamPath, nil)
	if err != nil {
		cancel()
		return nil, err
	}
	request.Header.Set("Accept", "text/event-stream")

	streamHTTP := *c.http
	streamHTTP.Timeout = 0
	response, err := streamHTTP.Do(request)
	if err != nil {
		cancel()
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		_ = response.Body.Close()
		cancel()
		return nil, fmt.Errorf("GET %s failed: %s %s", clientStateStreamPath, response.Status, strings.TrimSpace(string(body)))
	}

	events := make(chan clientStateStreamResult, 16)
	stream := &clientStateStream{events: events, cancel: cancel}
	go func() {
		defer close(events)
		defer response.Body.Close()
		readClientStateSSE(ctx, response.Body, events)
	}()
	return stream, nil
}

func readClientStateSSE(ctx context.Context, body io.Reader, events chan<- clientStateStreamResult) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	eventName := ""
	dataLines := []string{}
	flush := func() bool {
		if len(dataLines) == 0 {
			eventName = ""
			return true
		}
		if eventName == "" || eventName == clientStateStreamEventName {
			var event clientStateStreamEvent
			if err := json.Unmarshal([]byte(strings.Join(dataLines, "\n")), &event); err != nil {
				return sendStreamResult(ctx, events, clientStateStreamResult{err: err})
			}
			if !sendStreamResult(ctx, events, clientStateStreamResult{event: event}) {
				return false
			}
		}
		eventName = ""
		dataLines = nil
		return true
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if !flush() {
				return
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		field, value, ok := strings.Cut(line, ":")
		if ok {
			value = strings.TrimPrefix(value, " ")
		} else {
			value = ""
		}
		switch field {
		case "event":
			eventName = value
		case "data":
			dataLines = append(dataLines, value)
		}
	}
	if len(dataLines) > 0 {
		_ = flush()
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		_ = sendStreamResult(ctx, events, clientStateStreamResult{err: err})
	}
}

func sendStreamResult(ctx context.Context, events chan<- clientStateStreamResult, result clientStateStreamResult) bool {
	select {
	case <-ctx.Done():
		return false
	case events <- result:
		return true
	}
}

func waitForStreamSnapshot(ctx context.Context, stream *clientStateStream, cancel <-chan struct{}, afterRevision int) (snapshot, int, bool, error) {
	timer := time.NewTimer(10 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return snapshot{}, afterRevision, false, ctx.Err()
		case <-cancel:
			return snapshot{}, afterRevision, true, nil
		case <-timer.C:
			return snapshot{}, afterRevision, false, fmt.Errorf("timed out waiting for client-state stream revision after %d", afterRevision)
		case result, ok := <-stream.events:
			if !ok {
				return snapshot{}, afterRevision, false, fmt.Errorf("client-state stream closed")
			}
			if result.err != nil {
				return snapshot{}, afterRevision, false, result.err
			}
			if result.event.Revision <= afterRevision {
				continue
			}
			snap, err := result.event.snapshot()
			if err != nil {
				return snapshot{}, afterRevision, false, err
			}
			return snap, result.event.Revision, false, nil
		}
	}
}

func (c apiClient) getCollection(ctx context.Context, path string) ([]entity, error) {
	return measurePerfCall(c.perf, "frontend.http", "GET", path, "", nil, func() ([]entity, error) {
		var raw [][]json.RawMessage
		if err := c.getJSON(ctx, path, &raw); err != nil {
			return nil, err
		}
		return decodeEntityPairs(raw)
	})
}

func (c apiClient) getJSON(ctx context.Context, path string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return fmt.Errorf("GET %s failed: %s %s", path, response.Status, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(response.Body).Decode(target)
}

func decodeEntityPairs(raw [][]json.RawMessage) ([]entity, error) {
	items := make([]entity, 0, len(raw))
	for _, pair := range raw {
		if len(pair) < 2 {
			continue
		}
		var item entity
		if err := json.Unmarshal(pair[1], &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (c apiClient) doAction(ctx context.Context, act action) error {
	return c.postJSON(ctx, "/act", actionPayload{Action: act})
}

func (c apiClient) saveGame(ctx context.Context) error {
	return c.postNoBody(ctx, "/save")
}

func (c apiClient) restoreGame(ctx context.Context) error {
	return c.postNoBody(ctx, "/restore")
}

func (c apiClient) quitGame(ctx context.Context) error {
	return c.postNoBody(ctx, "/quit")
}

func (c apiClient) selectRole(ctx context.Context, roleID string) error {
	return c.postJSON(ctx, "/setup/role", rolePayload{RoleID: roleID})
}

func (c apiClient) confirmSetup(ctx context.Context, confirm bool) error {
	return c.postJSON(ctx, "/setup/confirm", setupConfirmPayload{Confirm: confirm})
}

func (c apiClient) postNoBody(ctx context.Context, path string) error {
	_, err := measurePerfCall(c.perf, "frontend.http", "POST", path, "", nil, func() (struct{}, error) {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, nil)
		if err != nil {
			return struct{}{}, err
		}
		request.Header.Set(localMutationHeaderName, localMutationHeaderValue)
		response, err := c.http.Do(request)
		if err != nil {
			return struct{}{}, err
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
			return struct{}{}, fmt.Errorf("POST %s failed: %s %s", path, response.Status, strings.TrimSpace(string(body)))
		}
		return struct{}{}, nil
	})
	return err
}

func (c apiClient) postJSON(ctx context.Context, path string, payload any) error {
	_, err := measurePerfCall(c.perf, "frontend.http", "POST", path, "", nil, func() (struct{}, error) {
		body, err := json.Marshal(payload)
		if err != nil {
			return struct{}{}, err
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
		if err != nil {
			return struct{}{}, err
		}
		request.Header.Set("content-type", "application/json")
		response, err := c.http.Do(request)
		if err != nil {
			return struct{}{}, err
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
			return struct{}{}, fmt.Errorf("POST %s failed: %s %s", path, response.Status, strings.TrimSpace(string(body)))
		}
		return struct{}{}, nil
	})
	return err
}

func normalizeBubbleTeaInput(msg tea.KeyMsg) string {
	s := msg.String()
	switch s {
	case "ctrl+c":
		return "C-c"
	case "ctrl+h", "backspace":
		return "C-h"
	case "ctrl+j":
		return "C-j"
	case "ctrl+k":
		return "C-k"
	case "ctrl+l":
		return "C-l"
	case "ctrl+y":
		return "C-y"
	case "ctrl+u":
		return "C-u"
	case "ctrl+b":
		return "C-b"
	case "ctrl+n":
		return "C-n"
	case "ctrl+s":
		return "C-s"
	case "ctrl+q":
		return "C-q"
	case "alt+l":
		return "M-l"
	case "enter":
		return "enter"
	case "esc":
		return "escape"
	case "space":
		return " "
	default:
		return s
	}
}

var baseMovementDirections = map[string]string{
	"h": "W",
	"j": "S",
	"k": "N",
	"l": "E",
	"y": "NW",
	"u": "NE",
	"b": "SW",
	"n": "SE",
}

var movementDeltas = map[string]pos{
	"N":  {X: 0, Y: -1, Z: 0},
	"E":  {X: 1, Y: 0, Z: 0},
	"S":  {X: 0, Y: 1, Z: 0},
	"W":  {X: -1, Y: 0, Z: 0},
	"NE": {X: 1, Y: -1, Z: 0},
	"NW": {X: -1, Y: -1, Z: 0},
	"SE": {X: 1, Y: 1, Z: 0},
	"SW": {X: -1, Y: 1, Z: 0},
}

var travelDirections = []string{"W", "N", "E", "S", "NW", "NE", "SE", "SW"}
var cardinalMovementDirections = []string{"N", "E", "S", "W"}
var clockwiseDirections = []string{"N", "NE", "E", "SE", "S", "SW", "W", "NW"}

func isBaseMovementInput(input string) bool {
	_, ok := baseMovementDirections[input]
	return ok
}

func parseMovementCommand(input string) (moveCommand, bool) {
	if dir, ok := baseMovementDirections[input]; ok {
		return moveCommand{tag: "walk", dir: dir}, true
	}
	if len(input) == 1 && input != strings.ToLower(input) {
		if dir, ok := baseMovementDirections[strings.ToLower(input)]; ok {
			return moveCommand{tag: "run-to-block", dir: dir}, true
		}
	}
	if strings.HasPrefix(input, "C-") && len(input) == 3 {
		if dir, ok := baseMovementDirections[input[2:]]; ok {
			return moveCommand{tag: "run", dir: dir}, true
		}
	}
	parts := strings.Split(input, "+")
	if len(parts) == 2 {
		if dir, ok := baseMovementDirections[parts[1]]; ok {
			switch parts[0] {
			case "g":
				return moveCommand{tag: "rush", dir: dir}, true
			case "G":
				return moveCommand{tag: "run", dir: dir}, true
			case "m":
				return moveCommand{tag: "no-pickup-walk", dir: dir}, true
			case "M":
				return moveCommand{tag: "no-pickup-run", dir: dir}, true
			}
		}
	}
	return moveCommand{}, false
}

func requiresRepeatedMovement(command moveCommand) bool {
	return command.tag == "run-to-block" || command.tag == "rush" || command.tag == "run" || command.tag == "no-pickup-run"
}

func doorDirectionPrompt(kind string) string {
	label := "Open"
	if kind == "close" {
		label = "Close"
	}
	return label + " direction: hjkl/yubn, Esc cancel"
}

func talkDirectionPrompt() string {
	return "Talk direction: hjkl/yubn, Esc cancel"
}

func quitWarningPrompt() string {
	return "Really quit? This permanently ends the game; save exits without quitting. [yn]"
}

func parseAction(input string) (action, bool) {
	if command, ok := parseMovementCommand(input); ok {
		if command.tag == "walk" || command.tag == "no-pickup-walk" {
			return action{Tag: "move", Dir: command.dir}, true
		}
	}
	if input == "." {
		return action{Tag: "noop"}, true
	}
	if input == ">" {
		return action{Tag: "descend"}, true
	}
	if input == "<" {
		return action{Tag: "ascend"}, true
	}
	return action{}, false
}

func commandLabel(command moveCommand) string {
	switch command.tag {
	case "rush":
		return "rush"
	case "no-pickup-run":
		return "run without pickup"
	default:
		return "run"
	}
}

func formatAutoResult(result autoRunResult) string {
	switch result.kind {
	case "arrived":
		if result.steps == 0 {
			return "already there"
		}
		return fmt.Sprintf("arrived after %d steps", result.steps)
	case "blocked":
		if result.steps == 0 {
			return result.label + " blocked immediately"
		}
		return fmt.Sprintf("%s blocked after %d steps", result.label, result.steps)
	case "cancelled":
		return fmt.Sprintf("%s canceled after %d steps", result.label, result.steps)
	case "interesting":
		return fmt.Sprintf("%s stopped at something interesting after %d steps", result.label, result.steps)
	case "player-not-found":
		return "cannot " + result.label + ": player not found"
	case "too-far":
		return fmt.Sprintf("%s stopped after %d steps", result.label, result.steps)
	default:
		return fmt.Sprintf("%s stopped after %d steps", result.label, result.steps)
	}
}

func findPlayer(world []entity) (entity, bool) {
	for _, item := range world {
		if item.Tag == "player" && item.In == "world" {
			return item, true
		}
	}
	return entity{}, false
}

func samePos(a, b pos) bool {
	return a.X == b.X && a.Y == b.Y && a.Z == b.Z
}

func addPos(a, b pos) pos {
	return pos{X: a.X + b.X, Y: a.Y + b.Y, Z: a.Z + b.Z}
}

func worldTravelBounds(world []entity, target pos) (int, int) {
	maxX := boardWidth - 1
	maxY := boardHeight - 1
	for _, item := range world {
		if item.In != "world" || item.At.Z != target.Z {
			continue
		}
		maxX = max(maxX, item.At.X)
		maxY = max(maxY, item.At.Y)
	}
	return maxX, maxY
}

func clampTravelTarget(p pos, world []entity) pos {
	maxX, maxY := worldTravelBounds(world, p)
	return pos{X: clamp(p.X, 0, maxX), Y: clamp(p.Y, 0, maxY), Z: p.Z}
}

func moveTravelTarget(target pos, dir string, world []entity) pos {
	return clampTravelTarget(addPos(target, movementDeltas[dir]), world)
}

func travelPrompt(target pos) string {
	return fmt.Sprintf("Travel target %d,%d: hjkl/yubn move, Enter travel, Esc cancel", target.X, target.Y)
}

func clamp(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

func findTravelDirections(world []entity, start, target pos) []string {
	if samePos(start, target) {
		return []string{}
	}
	passable := map[string]pos{}
	blocked := map[string]bool{}
	for _, item := range world {
		if item.In != "world" {
			continue
		}
		if isPassableTerrain(item) {
			passable[posKey(item.At)] = item.At
		}
		if isImpassableTerrain(item) || (isCreature(item) && !samePos(item.At, start)) {
			blocked[posKey(item.At)] = true
		}
	}
	for key := range blocked {
		delete(passable, key)
	}
	passable[posKey(start)] = start
	if _, ok := passable[posKey(target)]; !ok {
		return nil
	}
	dist := map[string]int{posKey(target): 0}
	queue := []pos{target}
	for i := 0; i < len(queue); i++ {
		current := queue[i]
		currentDistance := dist[posKey(current)]
		for _, dir := range travelDirections {
			next := addPos(current, movementDeltas[dir])
			nextKey := posKey(next)
			if _, ok := passable[nextKey]; !ok {
				continue
			}
			if _, ok := dist[nextKey]; ok {
				continue
			}
			dist[nextKey] = currentDistance + 1
			queue = append(queue, passable[nextKey])
		}
	}
	current := start
	remaining, ok := dist[posKey(current)]
	if !ok {
		return nil
	}
	path := []string{}
	for remaining > 0 {
		found := false
		for _, dir := range travelDirections {
			candidate := addPos(current, movementDeltas[dir])
			candidateDistance, ok := dist[posKey(candidate)]
			if ok && candidateDistance == remaining-1 {
				path = append(path, dir)
				current = candidate
				remaining--
				found = true
				break
			}
		}
		if !found {
			return nil
		}
	}
	return path
}

func posKey(p pos) string {
	return fmt.Sprintf("%d,%d,%d", p.X, p.Y, p.Z)
}

type viewport struct {
	left int
	top  int
	z    int
	hasZ bool
}

func viewportForWorld(world []entity) viewport {
	player, ok := findPlayer(world)
	if !ok {
		return viewport{}
	}
	maxX := player.At.X
	maxY := player.At.Y
	for _, item := range world {
		if item.In != "world" || item.At.Z != player.At.Z {
			continue
		}
		maxX = max(maxX, item.At.X)
		maxY = max(maxY, item.At.Y)
	}
	return viewport{
		left: clamp(player.At.X-boardWidth/2, 0, max(0, maxX-boardWidth+1)),
		top:  clamp(player.At.Y-boardHeight/2, 0, max(0, maxY-boardHeight+1)),
		z:    player.At.Z,
		hasZ: true,
	}
}

func screenPos(p pos, vp viewport) pos {
	return pos{X: p.X - vp.left, Y: p.Y - vp.top, Z: p.Z}
}

func isVisibleScreenPos(p pos) bool {
	return p.X >= 0 && p.X < boardWidth && p.Y >= 0 && p.Y < boardHeight
}

func drawWorld(world []entity, target *pos) [][]tile {
	return drawWorldWithTileFor(world, target, tileFor)
}

func drawWorldWithCampground(world []entity, target *pos, campground campgroundView) [][]tile {
	return drawWorldWithTileFor(world, target, func(item entity) tile {
		return tileForCampground(item, campground)
	})
}

func drawWorldWithTileFor(world []entity, target *pos, tileForEntity func(entity) tile) [][]tile {
	tiles := make([][]tile, boardHeight)
	for y := 0; y < boardHeight; y++ {
		tiles[y] = make([]tile, boardWidth)
		for x := 0; x < boardWidth; x++ {
			tiles[y][x] = tile{char: " "}
		}
	}
	vp := viewportForWorld(world)
	chosen := map[string]entity{}
	for _, item := range world {
		if item.In != "world" || (vp.hasZ && item.At.Z != vp.z) {
			continue
		}
		screenItem := item
		screenItem.At = screenPos(item.At, vp)
		if !isVisibleScreenPos(screenItem.At) {
			continue
		}
		key := posKey(screenItem.At)
		if previous, ok := chosen[key]; !ok || zIndex(screenItem) >= zIndex(previous) {
			chosen[key] = screenItem
		}
	}
	for _, item := range chosen {
		tiles[item.At.Y][item.At.X] = tileForEntity(item)
	}
	if target != nil && (!vp.hasZ || target.Z == vp.z) {
		screenTarget := screenPos(*target, vp)
		if isVisibleScreenPos(screenTarget) {
			tiles[screenTarget.Y][screenTarget.X] = tile{char: "*", color: lipgloss.Color("11"), bright: true}
		}
	}
	return tiles
}

func campgroundHasHeavyRain(campground campgroundView) bool {
	return campground.Weather != nil && campground.Weather.Condition == "heavy-rain"
}

func tileForCampground(item entity, campground campgroundView) tile {
	if item.Tag == "floor" && item.At.Z == 0 && campgroundHasHeavyRain(campground) {
		return tile{char: ",", color: lipgloss.Color("3")}
	}
	return tileFor(item)
}

func tileFor(item entity) tile {
	if item.Tag == "flag" && item.Key == "campground-missing-flag" {
		return tile{char: "f", color: lipgloss.Color("11"), bright: true}
	}
	switch item.Tag {
	case "player":
		return tile{char: "@", color: lipgloss.Color("15"), bright: true}
	case "ranger":
		return tile{char: "@", color: lipgloss.Color("13"), bright: true}
	case "hippie":
		return tile{char: "h", color: lipgloss.Color("11")}
	case "wook":
		return tile{char: "h", color: lipgloss.Color("14")}
	case "acidcop":
		return tile{char: "K", color: lipgloss.Color("13")}
	case "lesser_egregore":
		return tile{char: "e", color: lipgloss.Color("10")}
	case "greater_egregore", "collective_egregore":
		return tile{char: "E", color: lipgloss.Color("10")}
	case "flag":
		return tile{char: "F", color: lipgloss.Color("11"), bright: true}
	case "water":
		return tile{char: "!", color: lipgloss.Color("14")}
	case "booze", "trailmix":
		return tile{char: itemChar(item), color: lipgloss.Color("11")}
	case "beer":
		return tile{char: "!", color: lipgloss.Color("11"), bright: true}
	case "milk", "pancake", "hammer":
		return tile{char: itemChar(item), color: lipgloss.Color("15"), bright: true}
	case "acid":
		return tile{char: "!", color: lipgloss.Color("10")}
	case "bacon", "hotdog", "soup", "salsa":
		return tile{char: "%", color: lipgloss.Color("9"), bright: item.Tag == "bacon" || item.Tag == "hotdog"}
	case "poptart", "cheese":
		return tile{char: "%", color: lipgloss.Color("11"), bright: true}
	case "cooler":
		return tile{char: "C", color: lipgloss.Color("14"), bright: true}
	case "nails":
		return tile{char: ":", color: lipgloss.Color("14"), bright: true}
	case "wall":
		return tile{char: wallChar(item.Variant), color: lipgloss.Color("15")}
	case "door":
		color := lipgloss.Color("3")
		if item.Kind == "tent" {
			color = lipgloss.Color("11")
		}
		if item.Open {
			return tile{char: "+", color: color}
		}
		return tile{char: wallChar(item.Variant), color: color}
	case "tent-wall":
		return tile{char: wallChar(item.Variant), color: lipgloss.Color("11")}
	case "tent-post":
		return tile{char: "┼", color: lipgloss.Color("11")}
	case "tunnel":
		return tile{char: "#", color: lipgloss.Color("15")}
	case "mud":
		return tile{char: ";", color: lipgloss.Color("3")}
	case "floor":
		return tile{char: "·", color: lipgloss.Color("8"), bright: true}
	case "tent":
		return tile{char: "^", color: lipgloss.Color("11"), bright: true}
	case "sign":
		return tile{char: "?", color: lipgloss.Color("14"), bright: true}
	case "effigy":
		return tile{char: "Y", color: lipgloss.Color("9"), bright: true}
	case "temple":
		return tile{char: "Ω", color: lipgloss.Color("13"), bright: true}
	case "stairs-down":
		return tile{char: ">", color: lipgloss.Color("15"), bright: true}
	case "stairs-up":
		return tile{char: "<", color: lipgloss.Color("15"), bright: true}
	case "camp-prop":
		return campPropTile(item.Kind)
	default:
		return tile{char: "?", color: lipgloss.Color("9")}
	}
}

func campPropTile(kind string) tile {
	switch kind {
	case "arrival-gate":
		return tile{char: "G", color: lipgloss.Color("13"), bright: true}
	case "artwork":
		return tile{char: "A", color: lipgloss.Color("9"), bright: true}
	case "flagpole":
		return tile{char: "|", color: lipgloss.Color("11"), bright: true}
	case "stage":
		return tile{char: "=", color: lipgloss.Color("13"), bright: true}
	case "workbench":
		return tile{char: "W", color: lipgloss.Color("11"), bright: true}
	case "bike-rack":
		return tile{char: "B", color: lipgloss.Color("14"), bright: true}
	case "directory":
		return tile{char: "D", color: lipgloss.Color("14"), bright: true}
	case "water-station":
		return tile{char: "~", color: lipgloss.Color("14"), bright: true}
	case "speaker":
		return tile{char: "S", color: lipgloss.Color("13"), bright: true}
	case "lantern":
		return tile{char: "L", color: lipgloss.Color("11"), bright: true}
	case "table":
		return tile{char: "T", color: lipgloss.Color("15"), bright: true}
	default:
		return tile{char: "?", color: lipgloss.Color("9")}
	}
}

func itemChar(item entity) string {
	switch item.Tag {
	case "hammer":
		return "T"
	default:
		return "%"
	}
}

func wallChar(variant string) string {
	switch variant {
	case "vertical":
		return "│"
	case "horizontal":
		return "─"
	case "topLeft":
		return "┌"
	case "topRight":
		return "┐"
	case "bottomLeft":
		return "└"
	case "bottomRight":
		return "┘"
	case "cross":
		return "┼"
	case "t-up":
		return "┴"
	case "t-down":
		return "┬"
	case "t-left":
		return "┤"
	case "t-right":
		return "├"
	default:
		return " "
	}
}

func zIndex(item entity) int {
	switch item.Tag {
	case "tent":
		return -1
	case "floor", "tunnel":
		return 0
	case "mud":
		return 1
	case "wall", "door", "tent-wall", "tent-post", "sign", "effigy", "temple", "stairs-down", "stairs-up", "camp-prop":
		return 2
	default:
		if isCreature(item) {
			return 4
		}
		if isItem(item) {
			return 3
		}
		return 3
	}
}

func isTerrain(item entity) bool {
	switch item.Tag {
	case "wall", "door", "tent-wall", "tent-post", "floor", "tunnel", "mud", "tent", "sign", "effigy", "temple", "stairs-down", "stairs-up", "camp-prop":
		return true
	default:
		return false
	}
}

func isImpassableTerrain(item entity) bool {
	if item.Tag == "camp-prop" {
		return !isCampPropPassable(item.Kind)
	}
	return item.Tag == "wall" || item.Tag == "tent-wall" || item.Tag == "tent-post" || (item.Tag == "door" && !item.Open)
}

func isCampPropPassable(kind string) bool {
	switch kind {
	case "arrival-gate", "stage", "directory", "lantern":
		return true
	case "artwork", "flagpole", "workbench", "bike-rack", "water-station", "speaker", "table":
		return false
	default:
		return false
	}
}

func isPassableTerrain(item entity) bool {
	return isTerrain(item) && !isImpassableTerrain(item)
}

func isCreature(item entity) bool {
	switch item.Tag {
	case "player", "ranger", "hippie", "wook", "acidcop", "lesser_egregore", "greater_egregore", "collective_egregore":
		return true
	default:
		return false
	}
}

func isItem(item entity) bool {
	return !isTerrain(item) && !isCreature(item)
}

func isFoodItem(item entity) bool {
	if !isItem(item) {
		return false
	}
	switch item.Tag {
	case "poptart", "trailmix", "pancake", "bacon", "soup", "hotdog", "cheese", "salsa":
		return true
	default:
		return false
	}
}

func isDrinkItem(item entity) bool {
	if !isItem(item) {
		return false
	}
	switch item.Tag {
	case "water", "acid", "booze", "beer", "milk":
		return true
	default:
		return false
	}
}

func filterItems(items []entity, keep func(entity) bool) []entity {
	filtered := []entity{}
	for _, item := range items {
		if keep(item) {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func filterFoodItems(items []entity) []entity {
	return filterItems(items, isFoodItem)
}

func filterDrinkItems(items []entity) []entity {
	return filterItems(items, isDrinkItem)
}

func entitiesAtPosition(world []entity, p pos) []entity {
	items := []entity{}
	for _, item := range world {
		if item.In == "world" && samePos(item.At, p) {
			items = append(items, item)
		}
	}
	return items
}

func describeLookTarget(world []entity, target pos) string {
	return describeLookTargetWith(world, target, describeEntityForLook)
}

func describeLookTargetWith(
	world []entity,
	target pos,
	describeEntity func(entity) string,
) string {
	items := entitiesAtPosition(world, target)
	if len(items) == 0 {
		return fmt.Sprintf("Look %d,%d: unexplored", target.X, target.Y)
	}
	hasMud := false
	for _, item := range items {
		if item.Tag == "mud" {
			hasMud = true
			break
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		left := zIndex(items[i])
		right := zIndex(items[j])
		if left != right {
			return left > right
		}
		return items[i].Tag < items[j].Tag
	})
	descriptions := make([]string, 0, len(items))
	for _, item := range items {
		if hasMud && item.Tag == "floor" {
			continue
		}
		descriptions = append(descriptions, describeEntity(item))
	}
	return fmt.Sprintf("Look %d,%d: %s", target.X, target.Y, strings.Join(descriptions, "; "))
}

func describeLookTargetWithCampground(
	world []entity,
	target pos,
	campground campgroundView,
) string {
	description := describeLookTargetWith(world, target, func(item entity) string {
		return describeEntityForCampgroundLook(item, campground)
	})
	for _, landmark := range campground.DiscoveredLandmarks {
		if samePos(landmark.At, target) {
			return fmt.Sprintf(
				"%s; landmark: %s (%s) — %s",
				description,
				landmark.Name,
				landmark.Kind,
				landmark.Address,
			)
		}
	}
	return description
}

func describeEntityForCampgroundLook(item entity, campground campgroundView) string {
	if item.Tag == "floor" && item.At.Z == 0 && campgroundHasHeavyRain(campground) {
		return "muddy ground"
	}
	return describeEntityForLook(item)
}

func describeEntityForLook(item entity) string {
	if item.Tag == "flag" && item.Key == "campground-missing-flag" {
		return "dust-caked flag"
	}
	switch item.Tag {
	case "player":
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = "you"
		}
		return "you (" + name + ")"
	case "ranger":
		name := strings.TrimSpace(item.Name)
		if name == "" {
			return "human"
		}
		return "human " + name
	case "hippie":
		return "hippie"
	case "wook":
		return "wook"
	case "acidcop":
		return "acid cop"
	case "lesser_egregore":
		return "lesser egregore"
	case "greater_egregore":
		return "greater egregore"
	case "collective_egregore":
		return "collective egregore"
	case "floor":
		return "dusty ground"
	case "tunnel":
		return "road"
	case "mud":
		return "mud puddle"
	case "wall":
		return "wall"
	case "door":
		name := "door"
		if item.Kind == "tent" {
			name = "tent door"
		}
		if item.Open {
			return "open " + name
		}
		return "closed " + name
	case "tent-wall":
		return "tent-wall"
	case "tent-post":
		return "tent-post"
	case "tent":
		return "tent"
	case "sign":
		if strings.TrimSpace(item.Name) == "" {
			return "sign"
		}
		return "sign: " + item.Name
	case "effigy":
		return "effigy"
	case "temple":
		return "temple"
	case "stairs-down":
		return "stairs down"
	case "stairs-up":
		return "stairs up"
	case "camp-prop":
		return campPropLookName(item.Kind)
	case "cooler":
		return "cooler"
	case "beer":
		return "beer"
	case "hotdog":
		return "hot dog"
	case "cheese":
		return "cheese"
	case "salsa":
		return "salsa"
	case "water":
		return "water bottle"
	case "booze":
		return "booze"
	case "milk":
		return "milk"
	case "acid":
		return "acid"
	case "poptart":
		return "poptart"
	case "trailmix":
		return "trail mix"
	case "pancake":
		return "pancake"
	case "bacon":
		return "bacon"
	case "soup":
		return "soup"
	case "flag":
		return "flag"
	case "hammer":
		return "hammer"
	case "nails":
		return "nails"
	default:
		return item.Tag
	}
}

func campPropLookName(kind string) string {
	switch kind {
	case "arrival-gate":
		return "arrival gate"
	case "artwork":
		return "artwork"
	case "flagpole":
		return "flagpole"
	case "stage":
		return "stage"
	case "workbench":
		return "workbench"
	case "bike-rack":
		return "bike rack"
	case "directory":
		return "directory"
	case "water-station":
		return "water station"
	case "speaker":
		return "speaker"
	case "lantern":
		return "lantern"
	case "table":
		return "table"
	default:
		return "camp prop"
	}
}

func directPosition(p pos, dir string) pos {
	return addPos(p, movementDeltas[dir])
}

func previousPositionFromDirection(p pos, dir string) pos {
	delta := movementDeltas[dir]
	return pos{X: p.X - delta.X, Y: p.Y - delta.Y, Z: p.Z - delta.Z}
}

func directionFromPositions(from, to pos) (string, bool) {
	dx := sign(to.X - from.X)
	dy := sign(to.Y - from.Y)
	for _, dir := range travelDirections {
		delta := movementDeltas[dir]
		if delta.X == dx && delta.Y == dy {
			return dir, true
		}
	}
	return "", false
}

func nonPlayerCreaturesAdjacentTo(world []entity, p pos) []entity {
	creatures := []entity{}
	for _, item := range world {
		if item.In == "world" && item.Tag != "player" && isCreature(item) && item.At.Z == p.Z && abs(item.At.X-p.X) <= 1 && abs(item.At.Y-p.Y) <= 1 {
			creatures = append(creatures, item)
		}
	}
	return creatures
}

func isKnownPassablePosition(world []entity, p pos) bool {
	hasPassable := false
	for _, item := range world {
		if item.In != "world" || !samePos(item.At, p) {
			continue
		}
		if isImpassableTerrain(item) {
			return false
		}
		if isPassableTerrain(item) {
			hasPassable = true
		}
	}
	return hasPassable
}

func isKnownCorridorPosition(world []entity, p pos) bool {
	for _, item := range world {
		if item.In == "world" && samePos(item.At, p) && item.Tag == "tunnel" {
			return true
		}
	}
	return false
}

func isKnownRoomPosition(world []entity, p pos) bool {
	for _, item := range world {
		if item.In == "world" && samePos(item.At, p) && item.Tag == "floor" {
			return true
		}
	}
	return false
}

func onwardPassablePositions(world []entity, p pos, previous pos) []pos {
	positions := []pos{}
	for _, dir := range travelDirections {
		candidate := addPos(p, movementDeltas[dir])
		if !samePos(candidate, previous) && isKnownPassablePosition(world, candidate) {
			positions = append(positions, candidate)
		}
	}
	return positions
}

func onwardCorridorPositions(world []entity, p pos, previous pos) []pos {
	positions := []pos{}
	for _, candidate := range onwardPassablePositions(world, p, previous) {
		if isKnownCorridorPosition(world, candidate) {
			positions = append(positions, candidate)
		}
	}
	return positions
}

func autorunStopsAtCorridorBoundaries(command moveCommand) bool {
	return command.tag == "run-to-block" || command.tag == "no-pickup-run"
}

func autorunMayTurnCorners(command moveCommand) bool {
	return command.tag == "run" || command.tag == "run-to-block" || command.tag == "no-pickup-run"
}

func shouldStopAtCorridorBoundary(command moveCommand, dir string, world []entity, p pos, previous *pos) bool {
	if !autorunStopsAtCorridorBoundaries(command) || !isKnownCorridorPosition(world, p) {
		return false
	}
	previousPos := previousPositionFromDirection(p, dir)
	if previous != nil {
		previousPos = *previous
	}
	for _, cardinalDir := range cardinalMovementDirections {
		candidate := addPos(p, movementDeltas[cardinalDir])
		if !samePos(candidate, previousPos) && isKnownRoomPosition(world, candidate) {
			return true
		}
	}
	return len(onwardCorridorPositions(world, p, previousPos)) > 1
}

func shouldStopDirectionalRun(command moveCommand, dir string, world []entity, p pos, previous pos) bool {
	directAhead := directPosition(p, dir)
	for _, item := range entitiesAtPosition(world, directAhead) {
		if item.Tag != "player" && isCreature(item) {
			return true
		}
	}
	if autorunStopsAtCorridorBoundaries(command) {
		return shouldStopAtCorridorBoundary(command, dir, world, p, &previous)
	}
	for _, item := range entitiesAtPosition(world, p) {
		if isItem(item) {
			return true
		}
	}
	if len(nonPlayerCreaturesAdjacentTo(world, p)) > 0 {
		return true
	}
	return command.tag == "rush" && isKnownCorridorPosition(world, p) && len(onwardCorridorPositions(world, p, previous)) > 1
}

type nextDirectionResult struct {
	direction       string
	turnAccumulator int
}

func nextDirectionalRunDirection(command moveCommand, dir string, world []entity, p pos, previous pos, turnAccumulator int) nextDirectionResult {
	if !autorunMayTurnCorners(command) || !isKnownCorridorPosition(world, p) {
		return nextDirectionResult{direction: dir, turnAccumulator: turnAccumulator}
	}
	choices := []pos{}
	for _, candidate := range onwardCorridorPositions(world, p, previous) {
		candidateDirection, ok := directionFromPositions(p, candidate)
		if ok && directionDotProduct(dir, candidateDirection) >= 0 {
			choices = append(choices, candidate)
		}
	}
	if len(choices) != 1 {
		return nextDirectionResult{direction: dir, turnAccumulator: turnAccumulator}
	}
	nextDirection, ok := directionFromPositions(p, choices[0])
	if !ok {
		return nextDirectionResult{direction: dir, turnAccumulator: turnAccumulator}
	}
	nextTurnAccumulator := turnAccumulator + turnAmount(dir, nextDirection)
	if nextTurnAccumulator < -2 || nextTurnAccumulator > 2 {
		return nextDirectionResult{direction: dir, turnAccumulator: turnAccumulator}
	}
	return nextDirectionResult{direction: nextDirection, turnAccumulator: nextTurnAccumulator}
}

func directionDotProduct(left, right string) int {
	leftDelta := movementDeltas[left]
	rightDelta := movementDeltas[right]
	return leftDelta.X*rightDelta.X + leftDelta.Y*rightDelta.Y
}

func turnAmount(from, to string) int {
	fromIndex := indexOf(clockwiseDirections, from)
	toIndex := indexOf(clockwiseDirections, to)
	clockwise := toIndex - fromIndex
	if clockwise > 4 {
		return clockwise - 8
	}
	if clockwise < -4 {
		return clockwise + 8
	}
	return clockwise
}

func popupVisibleItems(popup popupState) []entity {
	if popup.kind == popupLoot && popup.mode == lootPut {
		return popup.putItems
	}
	return popup.items
}

func itemKeySet(items []entity) map[string]bool {
	set := map[string]bool{}
	for _, item := range items {
		set[item.Key] = true
	}
	return set
}

func cloneEntities(items []entity) []entity {
	clone := make([]entity, len(items))
	copy(clone, items)
	return clone
}

const landmarkLetterAlphabet = "abcdefghijklmnopstuvwxyzABCDEFGHIJKLMNOPSTUVWXYZ"

type letteredLandmark struct {
	letter   string
	landmark campgroundLandmark
}

func sortedCampgroundLandmarks(
	landmarks []campgroundLandmark,
) []campgroundLandmark {
	sorted := append([]campgroundLandmark(nil), landmarks...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Name != sorted[j].Name {
			return sorted[i].Name < sorted[j].Name
		}
		return sorted[i].ID < sorted[j].ID
	})
	return sorted
}

func letteredLandmarks(
	landmarks []campgroundLandmark,
) []letteredLandmark {
	entries := make([]letteredLandmark, 0, len(landmarks))
	letterIndex := 0
	for _, landmark := range sortedCampgroundLandmarks(landmarks) {
		letter := ""
		if landmark.TravelAvailable && letterIndex < len(landmarkLetterAlphabet) {
			letter = string(landmarkLetterAlphabet[letterIndex])
			letterIndex++
		}
		entries = append(entries, letteredLandmark{
			letter:   letter,
			landmark: landmark,
		})
	}
	return entries
}

func landmarkForLetter(
	landmarks []campgroundLandmark,
	input string,
) (campgroundLandmark, bool) {
	if len(input) != 1 {
		return campgroundLandmark{}, false
	}
	for _, entry := range letteredLandmarks(landmarks) {
		if entry.letter == input {
			return entry.landmark, true
		}
	}
	return campgroundLandmark{}, false
}

func isAlpha(input string) bool {
	if len(input) != 1 {
		return false
	}
	c := input[0]
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func sign(value int) int {
	if value < 0 {
		return -1
	}
	if value > 0 {
		return 1
	}
	return 0
}

func indexOf(values []string, target string) int {
	for index, value := range values {
		if value == target {
			return index
		}
	}
	return -1
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
