package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func readPerfRecords(t *testing.T, path string) []map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := splitNonEmptyLines(string(data))
	records := make([]map[string]any, 0, len(lines))
	for _, line := range lines {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("invalid perf JSON %q: %v", line, err)
		}
		records = append(records, record)
	}
	return records
}

func splitNonEmptyLines(input string) []string {
	lines := []string{}
	start := 0
	for index, char := range input {
		if char != '\n' {
			continue
		}
		if index > start {
			lines = append(lines, input[start:index])
		}
		start = index + 1
	}
	if start < len(input) {
		lines = append(lines, input[start:])
	}
	return lines
}

func TestPerfRecorderNoopsWhenDisabled(t *testing.T) {
	recorder := &perfRecorder{source: "charm"}
	path := filepath.Join(t.TempDir(), "perf.ndjson")

	got := recorder.measureString("frontend.component", "board", "", "trace-1", nil, func() string {
		return "ok"
	})
	recorder.markResponseReceived("loadState", "", "trace-1", time.Now())
	recorder.finishRedraws()

	if got != "ok" {
		t.Fatalf("measureString returned %q", got)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("disabled recorder should not create perf file, stat error=%v", err)
	}
}

func TestPerfRecorderWritesMeasurements(t *testing.T) {
	path := filepath.Join(t.TempDir(), "perf.ndjson")
	recorder := &perfRecorder{source: "charm", file: path, runID: "test-run"}

	got := recorder.measureString("frontend.component", "board", "", "trace-1", map[string]int{"worldSize": 2}, func() string {
		return "board"
	})
	if got != "board" {
		t.Fatalf("measureString returned %q", got)
	}

	records := readPerfRecords(t, path)
	if len(records) != 1 {
		t.Fatalf("record count = %d, want 1", len(records))
	}
	record := records[0]
	if record["kind"] != perfKind || record["schema"] != float64(perfSchema) {
		t.Fatalf("invalid perf envelope: %#v", record)
	}
	if record["source"] != "charm" || record["operation"] != "frontend.component" || record["phase"] != "board" {
		t.Fatalf("unexpected record identity: %#v", record)
	}
	if record["runId"] != "test-run" {
		t.Fatalf("runId = %#v", record["runId"])
	}
	if duration, ok := record["durationNs"].(float64); !ok || duration <= 0 {
		t.Fatalf("durationNs = %#v", record["durationNs"])
	}
}

func TestPerfRecorderFinishesPendingRedraws(t *testing.T) {
	path := filepath.Join(t.TempDir(), "perf.ndjson")
	recorder := &perfRecorder{source: "charm", file: path}

	recorder.markResponseReceived("actionAndRefresh", "move", "trace-2", time.Now().Add(-time.Millisecond))
	recorder.finishRedraws()
	recorder.finishRedraws()

	records := readPerfRecords(t, path)
	if len(records) != 1 {
		t.Fatalf("record count = %d, want 1", len(records))
	}
	record := records[0]
	if record["operation"] != "frontend.response_to_redraw_finished" || record["phase"] != "actionAndRefresh" {
		t.Fatalf("unexpected redraw record: %#v", record)
	}
	if record["traceId"] != "trace-2" || record["case"] != "move" {
		t.Fatalf("unexpected redraw trace/case: %#v", record)
	}
}
