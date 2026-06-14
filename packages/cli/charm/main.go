package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const (
	boardWidth       = 80
	boardHeight      = 20
	maxVisibleMsgs   = 50
	maxAutoMoveSteps = boardWidth * boardHeight
	defaultBaseURL   = "http://127.0.0.1:3000"
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
}

type action struct {
	Tag  string
	Dir  string
	Keys []string
}

func (a action) MarshalJSON() ([]byte, error) {
	payload := map[string]any{"_tag": a.Tag}
	if a.Dir != "" {
		payload["dir"] = a.Dir
	}
	if a.Tag == "pickupMulti" || a.Tag == "dropMulti" {
		if a.Keys == nil {
			payload["keys"] = []string{}
		} else {
			payload["keys"] = a.Keys
		}
	}
	return json.Marshal(payload)
}

type actionPayload struct {
	Action action `json:"action"`
}

type apiClient struct {
	baseURL string
	http    *http.Client
}

type snapshot struct {
	world     []entity
	inventory []entity
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
)

type popupState struct {
	kind   popupKind
	title  string
	items  []entity
	marked map[string]bool
}

type autoRunResult struct {
	label string
	steps int
	kind  string
}

type stateLoadedMsg struct {
	snapshot snapshot
	err      error
}

type pickupLoadedMsg struct {
	requestID int
	items     []entity
	err       error
}

type actionDoneMsg struct {
	snapshot snapshot
	err      error
}

type autoDoneMsg struct {
	id             int
	cancel         <-chan struct{}
	mutationSerial int
	result         autoRunResult
	snapshot       snapshot
	err            error
}

type model struct {
	client                 apiClient
	world                  []entity
	inventory              []entity
	messages               []string
	pendingMovementPrefix  string
	pendingExtendedCommand *string
	travelTarget           *pos
	popup                  *popupState
	pickupRequestID        int
	mutationSerial         int
	autoCancel             chan struct{}
	autoID                 int
	width                  int
	height                 int
}

var (
	mutedStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	helpStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("14"))
	messageStyle  = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1)
	sidebarStyle  = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1).Width(20)
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
	return model{
		client: apiClient{
			baseURL: resolveBaseURL(os.Environ()),
			http:    &http.Client{Timeout: 10 * time.Second},
		},
		messages: []string{},
	}
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
		return m, nil
	case actionDoneMsg:
		if msg.err != nil {
			m.addMessage("action failed: " + msg.err.Error())
			return m, nil
		}
		m.world = msg.snapshot.world
		m.inventory = msg.snapshot.inventory
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

	m.addMessage("doing " + input)

	if m.pendingExtendedCommand != nil {
		return m.handleExtendedCommandKey(input)
	}
	if m.travelTarget != nil {
		return m.handleTravelTargetKey(input)
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
		target := clampTravelTarget(player.At)
		m.travelTarget = &target
		m.addMessage(travelPrompt(target))
		return m, nil
	case ",":
		m.pendingMovementPrefix = ""
		m.pickupRequestID++
		m.popup = &popupState{kind: popupPickup, title: "Pickup what?", items: []entity{}, marked: map[string]bool{}}
		m.addMessage("picking up ")
		return m, loadPickupCmd(m.client, m.pickupRequestID)
	case "d":
		m.pendingMovementPrefix = ""
		m.popup = &popupState{kind: popupDrop, title: "Drop what?", items: m.inventory, marked: map[string]bool{}}
		m.addMessage("dropping")
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
			next := moveTravelTarget(target, command.dir)
			m.travelTarget = &next
			m.addMessage(travelPrompt(next))
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
		if kind == popupDrop {
			m.addMessage("canceling multidrop")
		} else {
			m.addMessage("canceling pickup")
		}
		return m, nil
	case ",":
		popup.marked = map[string]bool{}
		for _, item := range popup.items {
			popup.marked[item.Key] = true
		}
		return m, nil
	case " ", "space":
		valid := itemKeySet(popup.items)
		keys := []string{}
		for key := range popup.marked {
			if valid[key] {
				keys = append(keys, key)
			}
		}
		sort.Strings(keys)
		kind := popup.kind
		m.popup = nil
		m.mutationSerial++
		if kind == popupPickup {
			return m, actionAndRefreshCmd(m.client, action{Tag: "pickupMulti", Keys: keys})
		}
		return m, actionAndRefreshCmd(m.client, action{Tag: "dropMulti", Keys: keys})
	default:
		return m, nil
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
	return m, func() tea.Msg {
		result, snap, err := client.runDirectionalMovement(context.Background(), initialWorld, command, cancel)
		return autoDoneMsg{id: id, cancel: cancel, mutationSerial: mutationSerial, result: result, snapshot: snap, err: err}
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
	m.addMessage("traveling")
	return m, func() tea.Msg {
		result, snap, err := client.runTravel(context.Background(), initialWorld, target, cancel)
		return autoDoneMsg{id: id, cancel: cancel, mutationSerial: mutationSerial, result: result, snapshot: snap, err: err}
	}
}

func (m *model) addMessage(message string) {
	m.messages = append([]string{message}, m.messages...)
	if len(m.messages) > maxVisibleMsgs {
		m.messages = m.messages[:maxVisibleMsgs]
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
	board := renderBoard(m.world, m.travelTarget)
	sidebar := renderSidebar(m.inventory)
	main := lipgloss.JoinHorizontal(lipgloss.Top, board, sidebar)
	sections := []string{
		helpStyle.Render("Flag Hack Charmbracelet UI · hjklyubn move · Shift/Ctrl/g/G/m/M run · _ travel · , pickup · d drop · #quit"),
		main,
	}
	if m.popup != nil {
		sections = append(sections, renderPopup(*m.popup))
	}
	sections = append(sections, renderMessages(m.messages))
	return lipgloss.JoinVertical(lipgloss.Left, sections...)
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

func renderSidebar(inventory []entity) string {
	lines := []string{"inventory"}
	if len(inventory) == 0 {
		lines = append(lines, mutedStyle.Render("(empty)"))
	} else {
		for _, item := range inventory {
			lines = append(lines, item.Tag)
		}
	}
	return sidebarStyle.Render(strings.Join(lines, "\n"))
}

func renderMessages(messages []string) string {
	limit := min(len(messages), 10)
	lines := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		lines = append(lines, messages[i])
	}
	return messageStyle.Width(118).Render(strings.Join(lines, "\n"))
}

func renderPopup(popup popupState) string {
	lines := []string{popup.title, mutedStyle.Render(", marks all, space submits, q/r/Esc cancels")}
	if len(popup.items) == 0 {
		lines = append(lines, mutedStyle.Render("(nothing available)"))
	} else {
		for _, item := range popup.items {
			prefix := "  "
			line := item.Tag
			if popup.marked[item.Key] {
				prefix = "* "
				line = selectedStyle.Render(line)
			}
			lines = append(lines, prefix+line)
		}
	}
	return popupStyle.Render(strings.Join(lines, "\n"))
}

func loadStateCmd(client apiClient) tea.Cmd {
	return func() tea.Msg {
		snap, err := client.loadState(context.Background())
		return stateLoadedMsg{snapshot: snap, err: err}
	}
}

func loadPickupCmd(client apiClient, requestID int) tea.Cmd {
	return func() tea.Msg {
		items, err := client.getPickupItemsFor(context.Background(), "player")
		return pickupLoadedMsg{requestID: requestID, items: items, err: err}
	}
}

func actionAndRefreshCmd(client apiClient, act action) tea.Cmd {
	return func() tea.Msg {
		snap, err := client.actionAndRefresh(context.Background(), act)
		return actionDoneMsg{snapshot: snap, err: err}
	}
}

func (c apiClient) loadState(ctx context.Context) (snapshot, error) {
	world, err := c.getCollection(ctx, "/world")
	if err != nil {
		return snapshot{}, err
	}
	inventory, err := c.getCollection(ctx, "/inventory")
	if err != nil {
		inventory = []entity{}
	}
	return snapshot{world: world, inventory: inventory}, nil
}

func (c apiClient) actionAndRefresh(ctx context.Context, act action) (snapshot, error) {
	if err := c.doAction(ctx, act); err != nil {
		return snapshot{}, err
	}
	return c.loadState(ctx)
}

func (c apiClient) runDirectionalMovement(ctx context.Context, initialWorld []entity, command moveCommand, cancel <-chan struct{}) (autoRunResult, snapshot, error) {
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
		before := player.At
		snap, err := c.actionAndRefresh(ctx, action{Tag: "move", Dir: path[0]})
		if err != nil {
			return autoRunResult{label: "travel", kind: "error", steps: steps}, snapshot{}, err
		}
		world = snap.world
		steps++
		if cancelled(cancel) {
			return autoRunResult{label: "travel", kind: "cancelled", steps: steps}, snap, nil
		}
		after, ok := findPlayer(world)
		if !ok {
			return autoRunResult{label: "travel", kind: "player-not-found", steps: steps}, snapshot{}, nil
		}
		if samePos(before, after.At) {
			return autoRunResult{label: "travel", kind: "blocked", steps: steps}, snapshot{world: world}, nil
		}
	}
	return autoRunResult{label: "travel", kind: "too-far", steps: steps}, snapshot{world: world}, nil
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
	return c.getCollection(ctx, "/getPickupFor?key="+key)
}

func (c apiClient) getCollection(ctx context.Context, path string) ([]entity, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return nil, fmt.Errorf("GET %s failed: %s %s", path, response.Status, strings.TrimSpace(string(body)))
	}
	var raw [][]json.RawMessage
	if err := json.NewDecoder(response.Body).Decode(&raw); err != nil {
		return nil, err
	}
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
	body, err := json.Marshal(actionPayload{Action: act})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/act", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("content-type", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return fmt.Errorf("POST /act failed: %s %s", response.Status, strings.TrimSpace(string(body)))
	}
	return nil
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

func clampTravelTarget(p pos) pos {
	return pos{X: clamp(p.X, 0, boardWidth-1), Y: clamp(p.Y, 0, boardHeight-1), Z: p.Z}
}

func moveTravelTarget(target pos, dir string) pos {
	return clampTravelTarget(addPos(target, movementDeltas[dir]))
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
		if item.Tag == "floor" || item.Tag == "tunnel" {
			passable[posKey(item.At)] = item.At
		}
		if isCreature(item) && !samePos(item.At, start) {
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

func drawWorld(world []entity, target *pos) [][]tile {
	tiles := make([][]tile, boardHeight)
	for y := 0; y < boardHeight; y++ {
		tiles[y] = make([]tile, boardWidth)
		for x := 0; x < boardWidth; x++ {
			tiles[y][x] = tile{char: " "}
		}
	}
	chosen := map[string]entity{}
	for _, item := range world {
		if item.In != "world" || item.At.X < 0 || item.At.X >= boardWidth || item.At.Y < 0 || item.At.Y >= boardHeight {
			continue
		}
		key := posKey(item.At)
		if previous, ok := chosen[key]; !ok || zIndex(item) >= zIndex(previous) {
			chosen[key] = item
		}
	}
	for _, item := range chosen {
		tiles[item.At.Y][item.At.X] = tileFor(item)
	}
	if target != nil && target.X >= 0 && target.X < boardWidth && target.Y >= 0 && target.Y < boardHeight {
		tiles[target.Y][target.X] = tile{char: "*", color: lipgloss.Color("11"), bright: true}
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
	case "milk", "pancake", "hammer":
		return tile{char: itemChar(item), color: lipgloss.Color("15"), bright: true}
	case "acid":
		return tile{char: "!", color: lipgloss.Color("10")}
	case "bacon", "soup":
		return tile{char: "%", color: lipgloss.Color("9"), bright: item.Tag == "bacon"}
	case "poptart":
		return tile{char: "%", color: lipgloss.Color("11"), bright: true}
	case "nails":
		return tile{char: ":", color: lipgloss.Color("14"), bright: true}
	case "wall":
		return tile{char: wallChar(item.Variant), color: lipgloss.Color("15")}
	case "tunnel":
		return tile{char: "#", color: lipgloss.Color("15")}
	case "floor":
		return tile{char: "·", color: lipgloss.Color("8"), bright: true}
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
	if isTerrain(item) {
		return 0
	}
	return 1
}

func isTerrain(item entity) bool {
	return item.Tag == "wall" || item.Tag == "floor" || item.Tag == "tunnel"
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

func entitiesAtPosition(world []entity, p pos) []entity {
	items := []entity{}
	for _, item := range world {
		if item.In == "world" && samePos(item.At, p) {
			items = append(items, item)
		}
	}
	return items
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
		if item.In == "world" && samePos(item.At, p) && (item.Tag == "floor" || item.Tag == "tunnel") {
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
