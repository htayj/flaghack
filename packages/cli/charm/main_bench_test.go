package main

import (
	"fmt"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func benchmarkWorld() []entity {
	world := make([]entity, 0, boardWidth*boardHeight+1)
	for y := 0; y < boardHeight; y++ {
		for x := 0; x < boardWidth; x++ {
			world = append(world, entity{Key: fmt.Sprintf("floor-%d-%d", x, y), Tag: "floor", In: "world", At: pos{X: x, Y: y, Z: 0}})
		}
	}
	world = append(world, entity{Key: "player", Tag: "player", Name: "you", In: "world", At: pos{X: 10, Y: 10, Z: 0}})
	return world
}

func BenchmarkDrawWorld(b *testing.B) {
	world := benchmarkWorld()
	for b.Loop() {
		_ = drawWorld(world, nil)
	}
}

func BenchmarkRenderBoard(b *testing.B) {
	world := benchmarkWorld()
	for b.Loop() {
		_ = renderBoard(world, nil)
	}
}

func BenchmarkView(b *testing.B) {
	m := newModel()
	m.world = benchmarkWorld()
	m.inventory = []entity{{Key: "beer-1", Tag: "beer", In: "player", At: pos{X: 10, Y: 10, Z: 0}}}
	m.messages = []string{"hello", "world"}
	for b.Loop() {
		_ = m.View()
	}
}

func BenchmarkUpdateWindowSize(b *testing.B) {
	m := newModel()
	msg := tea.WindowSizeMsg{Width: 120, Height: 40}
	for b.Loop() {
		updated, _ := m.Update(msg)
		m = updated.(model)
	}
}
