package main

import (
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
	travelWorldRefreshInterval = 24
)

type pos struct {
	X int `json:"x"`
	Y int `json:"y"`
	Z int `json:"z"`
}

type entity struct {
	Key     string `json:"key"`
	At      pos    `json:"at"`
	In      string `json:"in"`
	Tag     string `json:"_tag"`
	Variant string `json:"variant,omitempty"`
	Name    string `json:"name,omitempty"`
}

type action struct {
	Tag          string
	Dir          string
	ContainerKey string
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

type apiClient struct {
	baseURL string
	http    *http.Client
	perf    *perfRecorder
}

type snapshot struct {
	world     []entity
	inventory []entity
}

type clientStateResponse struct {
	World     [][]json.RawMessage `json:"world"`
	Inventory [][]json.RawMessage `json:"inventory"`
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
	client                 apiClient
	world                  []entity
	inventory              []entity
	messages               []string
	debugMessages          bool
	pendingMovementPrefix  string
	pendingExtendedCommand *string
	travelTarget           *pos
	lookTarget             *pos
	popup                  *popupState
	pickupRequestID        int
	lootRequestID          int
	mutationSerial         int
	autoCancel             chan struct{}
	autoID                 int
	width                  int
	height                 int
	perf                   *perfRecorder
}

var (
	mutedStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	helpStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("14"))
	messageStyle  = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1)
	sidebarStyle  = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1).Width(20)
	statusStyle   = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1).Width(118)
	popupStyle    = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Padding(0, 1).Width(34)
	selectedStyle = lipgloss.NewStyle().Reverse(true)
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
		debugMessages: options.debugMessages,
		messages:      []string{},
		perf:          perf,
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
	return loadStateCmd(m.client)
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
		m.world = msg.snapshot.world
		m.inventory = msg.snapshot.inventory
		m.perf.markResponseReceived("loadState", "initial", msg.perfTraceID, msg.responseReceived)
		return m, nil
	case pickupLoadedMsg:
		if m.popup == nil || m.popup.kind != popupPickup || msg.requestID != m.pickupRequestID {
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
		if msg.requestID != m.lootRequestID {
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
		if m.popup == nil || m.popup.kind != popupLoot || msg.requestID != m.lootRequestID {
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
		if msg.err != nil {
			m.addMessage("action failed: " + msg.err.Error())
			return m, nil
		}
		if msg.snapshot.world != nil {
			m.world = msg.snapshot.world
		}
		if msg.snapshot.inventory != nil {
			m.inventory = msg.snapshot.inventory
		}
		m.perf.markResponseReceived("actionAndRefresh", msg.caseName, msg.perfTraceID, msg.responseReceived)
		return m, nil
	case autoDoneMsg:
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
		if msg.snapshot.world != nil {
			m.world = msg.snapshot.world
		}
		if msg.snapshot.inventory != nil {
			m.inventory = msg.snapshot.inventory
		}
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
	if m.cancelActiveAutoMove() {
		return m, nil
	}
	if m.popup != nil {
		return m.handlePopupKey(input)
	}

	if input != "M-l" {
		m.lootRequestID++
	}

	m.addDebugMessage("doing " + input)

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
	case "#":
		m.pendingMovementPrefix = ""
		empty := ""
		m.pendingExtendedCommand = &empty
		m.addMessage("extended command: #")
		return m, nil
	case "_":
		m.pendingMovementPrefix = ""
		player, ok := findPlayer(m.world)
		if !ok {
			m.addMessage("cannot travel: player not found")
			return m, nil
		}
		target := clampTravelTarget(player.At, m.world)
		m.travelTarget = &target
		m.addMessage(travelPrompt(target))
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
		m.popup = &popupState{kind: popupEat, title: "Eat what?", stage: popupStageItems, items: filterFoodItems(m.inventory), marked: map[string]bool{}}
		m.addMessage("eating")
		return m, nil
	case "q":
		m.pendingMovementPrefix = ""
		m.popup = &popupState{kind: popupQuaff, title: "Quaff what?", stage: popupStageItems, items: filterDrinkItems(m.inventory), marked: map[string]bool{}}
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
		return m, actionAndRefreshCmd(m.client, act)
	}
	return m, nil
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
		if strings.EqualFold(strings.TrimPrefix(commandInput, "#"), "quit") {
			m.addMessage("quitting")
			return m, tea.Quit
		}
		m.addMessage("unknown extended command: #" + commandInput)
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
			return m, actionAndRefreshCmd(m.client, action{Tag: "pickupMulti", Keys: keys})
		}
		if kind == popupEat {
			return m, actionAndRefreshCmd(m.client, action{Tag: "eatMulti", Keys: keys})
		}
		if kind == popupQuaff {
			return m, actionAndRefreshCmd(m.client, action{Tag: "quaffMulti", Keys: keys})
		}
		if kind == popupLoot {
			if mode == lootPut {
				return m, actionAndRefreshCmd(m.client, action{Tag: "lootPutMulti", ContainerKey: containerKey, Keys: keys})
			}
			return m, actionAndRefreshCmd(m.client, action{Tag: "lootTakeMulti", ContainerKey: containerKey, Keys: keys})
		}
		return m, actionAndRefreshCmd(m.client, action{Tag: "dropMulti", Keys: keys})
	default:
		togglePopupLetter(popup, input)
		return m, nil
	}
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
	return m, func() tea.Msg {
		result, snap, err := client.runDirectionalMovement(context.Background(), initialWorld, command, cancel)
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
	return m, func() tea.Msg {
		result, snap, err := client.runTravel(context.Background(), initialWorld, target, cancel)
		return autoDoneMsg{id: id, cancel: cancel, mutationSerial: mutationSerial, result: result, snapshot: snap, err: err, caseName: "travel", perfTraceID: traceID, responseReceived: time.Now()}
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

func (m *model) cancelActiveAutoMove() bool {
	if m.autoCancel == nil {
		return false
	}
	close(m.autoCancel)
	m.autoCancel = nil
	m.pendingMovementPrefix = ""
	m.addMessage("automove canceled")
	return true
}

func (m model) View() string {
	view := m.perf.measureString("frontend.view", "total", "", "", map[string]int{"worldSize": len(m.world), "inventorySize": len(m.inventory)}, func() string {
		cursorTarget := m.travelTarget
		if m.lookTarget != nil {
			cursorTarget = m.lookTarget
		}
		board := m.perf.measureString("frontend.component", "board", "", "", map[string]int{"worldSize": len(m.world)}, func() string {
			return renderBoard(m.world, cursorTarget)
		})
		sidebar := m.perf.measureString("frontend.component", "sidebar", "", "", map[string]int{"inventorySize": len(m.inventory)}, func() string {
			return renderSidebarArea(m.inventory, m.popup)
		})
		main := m.perf.measureString("frontend.component", "main_join", "", "", nil, func() string {
			return lipgloss.JoinHorizontal(lipgloss.Top, board, sidebar)
		})
		sections := []string{
			m.perf.measureString("frontend.component", "event", "", "", map[string]int{"messageCount": len(m.messages)}, func() string {
				return renderEventArea(m.world, m.messages, m.lookTarget)
			}),
			main,
			m.perf.measureString("frontend.component", "status", "", "", map[string]int{"worldSize": len(m.world)}, func() string {
				return renderStatus(m.world)
			}),
		}
		if m.popup != nil && m.popup.kind == popupDrop {
			sections = append(sections, m.perf.measureString("frontend.component", "popup", "drop", "", map[string]int{"itemCount": len(m.popup.items)}, func() string {
				return renderPopup(*m.popup)
			}))
		}
		sections = append(sections, helpStyle.Render("Flag Hack Charmbracelet UI · hjklyubn move · Shift/Ctrl/g/G/m/M run · _ travel · ; look · , pickup · d drop · e eat · q quaff · M-l loot · item letters select · #quit"))
		return lipgloss.JoinVertical(lipgloss.Left, sections...)
	})
	m.perf.finishRedraws()
	return view
}

func renderBoard(world []entity, target *pos) string {
	tiles := drawWorld(world, target)
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

func renderSidebarArea(inventory []entity, popup *popupState) string {
	if popup != nil && popup.kind != popupDrop {
		return renderSidebarPopup(*popup)
	}
	return renderSidebar(inventory)
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

func renderEventArea(world []entity, messages []string, lookTarget *pos) string {
	if lookTarget != nil {
		return renderLookPanel(world, *lookTarget)
	}
	return renderMessages(messages)
}

func renderMessages(messages []string) string {
	return messageStyle.Width(118).Render(strings.Join(fixedEventLines(messages), "\n"))
}

func renderLookPanel(world []entity, target pos) string {
	lines := []string{
		describeLookTarget(world, target),
		mutedStyle.Render("hjkl/yubn move look cursor, Esc exits look mode"),
	}
	return messageStyle.Width(118).Render(strings.Join(fixedEventLines(lines), "\n"))
}

func renderStatus(world []entity) string {
	name := "player"
	dungeonLevel := "?"
	if player, ok := findPlayer(world); ok {
		if candidate := strings.TrimSpace(player.Name); candidate != "" {
			name = candidate
		}
		if player.At.Z == 0 {
			dungeonLevel = "burn"
		} else {
			dungeonLevel = fmt.Sprintf("%d", player.At.Z+1)
		}
	}
	lines := []string{
		"Player: " + name,
		"St:-- Dx:-- Co:-- In:-- Wi:-- Ch:--  HP:--/--  Pw:--/--",
		"AC:--  Dlvl:" + dungeonLevel,
	}
	return statusStyle.Render(strings.Join(lines, "\n"))
}

func renderPopup(popup popupState) string {
	lines := []string{popup.title, mutedStyle.Render("letters toggle, , marks all, space submits, q/r/Esc cancels")}
	if popup.stage == popupStageAction {
		lines = append(lines, "t - take", "p - put")
		return popupStyle.Render(strings.Join(lines, "\n"))
	}
	items := popupVisibleItems(popup)
	if len(items) == 0 {
		lines = append(lines, mutedStyle.Render("(nothing available)"))
	} else {
		for _, entry := range letteredItems(items) {
			lines = append(lines, renderLetteredItem(entry, popup.marked[entry.item.Key], true))
		}
	}
	return popupStyle.Render(strings.Join(lines, "\n"))
}

func renderSidebarPopup(popup popupState) string {
	lines := []string{popup.title}
	if popup.kind == popupLoot && popup.stage == popupStageAction {
		lines = append(lines, mutedStyle.Render("choose action"), "t - take", "p - put", mutedStyle.Render("q/r/Esc cancels"))
		return sidebarStyle.Render(strings.Join(lines, "\n"))
	}
	if popup.kind == popupLoot {
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
			lines = append(lines, renderLetteredItem(entry, popup.marked[entry.item.Key], false))
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

func actionAndRefreshCmd(client apiClient, act action) tea.Cmd {
	traceID := client.perf.nextTraceID("charm.action")
	return func() tea.Msg {
		snap, err := client.actionAndRefresh(context.Background(), act)
		return actionDoneMsg{snapshot: snap, err: err, caseName: act.Tag, perfTraceID: traceID, responseReceived: time.Now()}
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

func (c apiClient) runTravel(ctx context.Context, initialWorld []entity, target pos, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	measured, err := measurePerfCall(c.perf, "frontend.api", "runTravel", "travel", "", nil, func() (autoRunSnapshot, error) {
		result, snap, err := c.runTravelUnmeasured(ctx, initialWorld, target, cancel)
		return autoRunSnapshot{result: result, snapshot: snap}, err
	})
	return measured.result, measured.snapshot, err
}

func (c apiClient) runTravelUnmeasured(ctx context.Context, initialWorld []entity, target pos, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
	world := initialWorld
	steps := 0
	for steps < maxAutoMoveSteps {
		if cancelled(cancel) {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, snapshot{}, nil
		}
		player, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: "travel", kind: "player-not-found", steps: steps}, snapshot{}, nil
		}
		if samePos(player.At, target) {
			return autoRunResult{label: "travel", kind: "arrived", steps: steps}, snapshot{world: world}, nil
		}
		path := findTravelDirections(world, player.At, target)
		if len(path) == 0 {
			return autoRunResult{label: "travel", kind: "blocked", steps: steps}, snapshot{world: world}, nil
		}

		batch := straightTravelBatch(path, maxAutoMoveSteps-steps)
		before := player.At
		expected := before
		for _, direction := range batch {
			if cancelled(cancel) {
				return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, snapshot{world: world}, nil
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
		if cancelled(cancel) {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, refreshed, nil
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
	return autoRunResult{label: "travel", kind: "too-far", steps: steps}, snapshot{world: world}, nil
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
		world, err := decodeEntityPairs(raw.World)
		if err != nil {
			return snapshot{}, err
		}
		inventory, err := decodeEntityPairs(raw.Inventory)
		if err != nil {
			return snapshot{}, err
		}
		return snapshot{world: world, inventory: inventory}, nil
	})
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
	_, err := measurePerfCall(c.perf, "frontend.http", "POST", "/act", "", nil, func() (struct{}, error) {
		body, err := json.Marshal(actionPayload{Action: act})
		if err != nil {
			return struct{}{}, err
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/act", bytes.NewReader(body))
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
			return struct{}{}, fmt.Errorf("POST /act failed: %s %s", response.Status, strings.TrimSpace(string(body)))
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

func parseAction(input string) (action, bool) {
	if command, ok := parseMovementCommand(input); ok {
		if command.tag == "walk" || command.tag == "no-pickup-walk" {
			return action{Tag: "move", Dir: command.dir}, true
		}
	}
	if input == "." {
		return action{Tag: "noop"}, true
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
		if item.Tag == "wall" || (isCreature(item) && !samePos(item.At, start)) {
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
		tiles[item.At.Y][item.At.X] = tileFor(item)
	}
	if target != nil && (!vp.hasZ || target.Z == vp.z) {
		screenTarget := screenPos(*target, vp)
		if isVisibleScreenPos(screenTarget) {
			tiles[screenTarget.Y][screenTarget.X] = tile{char: "*", color: lipgloss.Color("11"), bright: true}
		}
	}
	return tiles
}

func tileFor(item entity) tile {
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
	case "tunnel":
		return tile{char: "#", color: lipgloss.Color("15")}
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
	case "wall", "sign", "effigy", "temple":
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
	case "wall", "floor", "tunnel", "tent", "sign", "effigy", "temple":
		return true
	default:
		return false
	}
}

func isPassableTerrain(item entity) bool {
	return isTerrain(item) && item.Tag != "wall"
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
	items := entitiesAtPosition(world, target)
	if len(items) == 0 {
		return fmt.Sprintf("Look %d,%d: unexplored", target.X, target.Y)
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
		descriptions = append(descriptions, describeEntityForLook(item))
	}
	return fmt.Sprintf("Look %d,%d: %s", target.X, target.Y, strings.Join(descriptions, "; "))
}

func describeEntityForLook(item entity) string {
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
	case "wall":
		return "wall"
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
	for _, item := range world {
		if item.In == "world" && samePos(item.At, p) && isPassableTerrain(item) {
			return true
		}
	}
	return false
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
