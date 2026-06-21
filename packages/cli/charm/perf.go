package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"syscall"
	"time"
)

const perfKind = "flaghack-perf"
const perfSchema = 1

type perfRecorder struct {
	source  string
	file    string
	stdout  bool
	runID   string
	mutex   sync.Mutex
	counter int
	pending []redrawMarker
}

type redrawMarker struct {
	operation string
	caseName  string
	traceID   string
	received  time.Time
}

type perfCPU struct {
	userMicros   int64
	systemMicros int64
}

type perfRecord struct {
	Schema          int            `json:"schema"`
	Kind            string         `json:"kind"`
	Source          string         `json:"source"`
	Suite           string         `json:"suite,omitempty"`
	Operation       string         `json:"operation"`
	Phase           string         `json:"phase,omitempty"`
	Case            string         `json:"case,omitempty"`
	TraceID         string         `json:"traceId,omitempty"`
	DurationNs      int64          `json:"durationNs"`
	CPUUserMicros   int64          `json:"cpuUserMicros"`
	CPUSystemMicros int64          `json:"cpuSystemMicros"`
	Counts          map[string]int `json:"counts,omitempty"`
	OK              bool           `json:"ok"`
	Error           string         `json:"error,omitempty"`
	Timestamp       string         `json:"timestamp,omitempty"`
	RunID           string         `json:"runId,omitempty"`
}

func newPerfRecorderFromEnv(source string) *perfRecorder {
	return &perfRecorder{
		source: source,
		file:   strings.TrimSpace(os.Getenv("FLAGHACK_PERF_FILE")),
		stdout: perfStdoutEnabled(os.Getenv("FLAGHACK_PERF_STDOUT")),
		runID:  strings.TrimSpace(os.Getenv("FLAGHACK_PERF_RUN_ID")),
	}
}

func perfStdoutEnabled(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}

func (r *perfRecorder) enabled() bool {
	return r != nil && (r.file != "" || r.stdout)
}

func (r *perfRecorder) nextTraceID(prefix string) string {
	if r == nil {
		return ""
	}
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.counter++
	return fmt.Sprintf("%s-%d-%d", prefix, time.Now().UnixNano(), r.counter)
}

func perfCPUUsage() perfCPU {
	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		return perfCPU{}
	}
	return perfCPU{
		userMicros:   usage.Utime.Sec*1_000_000 + int64(usage.Utime.Usec),
		systemMicros: usage.Stime.Sec*1_000_000 + int64(usage.Stime.Usec),
	}
}

func (r *perfRecorder) emit(record perfRecord) {
	if !r.enabled() {
		return
	}
	record.Schema = perfSchema
	record.Kind = perfKind
	record.Source = r.source
	if record.Timestamp == "" {
		record.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if record.RunID == "" {
		record.RunID = r.runID
	}
	line, err := json.Marshal(record)
	if err != nil {
		return
	}
	line = append(line, '\n')

	r.mutex.Lock()
	defer r.mutex.Unlock()
	if r.file != "" {
		if file, err := os.OpenFile(r.file, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
			_, _ = file.Write(line)
			_ = file.Close()
		}
	}
	if r.stdout {
		_, _ = os.Stdout.Write(append([]byte("FLAGHACK_PERF "), line...))
	}
}

func (r *perfRecorder) measureString(operation string, phase string, caseName string, traceID string, counts map[string]int, fn func() string) string {
	if !r.enabled() {
		return fn()
	}
	startedAt := time.Now()
	startedCPU := perfCPUUsage()
	result := fn()
	finishedCPU := perfCPUUsage()
	r.emit(perfRecord{
		Operation:       operation,
		Phase:           phase,
		Case:            caseName,
		TraceID:         traceID,
		DurationNs:      time.Since(startedAt).Nanoseconds(),
		CPUUserMicros:   finishedCPU.userMicros - startedCPU.userMicros,
		CPUSystemMicros: finishedCPU.systemMicros - startedCPU.systemMicros,
		Counts:          counts,
		OK:              true,
	})
	return result
}

func measurePerfCall[T any](r *perfRecorder, operation string, phase string, caseName string, traceID string, counts map[string]int, fn func() (T, error)) (T, error) {
	if !r.enabled() {
		return fn()
	}
	startedAt := time.Now()
	startedCPU := perfCPUUsage()
	result, err := fn()
	finishedCPU := perfCPUUsage()
	record := perfRecord{
		Operation:       operation,
		Phase:           phase,
		Case:            caseName,
		TraceID:         traceID,
		DurationNs:      time.Since(startedAt).Nanoseconds(),
		CPUUserMicros:   finishedCPU.userMicros - startedCPU.userMicros,
		CPUSystemMicros: finishedCPU.systemMicros - startedCPU.systemMicros,
		Counts:          counts,
		OK:              err == nil,
	}
	if err != nil {
		record.Error = err.Error()
	}
	r.emit(record)
	return result, err
}

func (r *perfRecorder) markResponseReceived(operation string, caseName string, traceID string, received time.Time) {
	if !r.enabled() || received.IsZero() {
		return
	}
	r.mutex.Lock()
	r.pending = append(r.pending, redrawMarker{operation: operation, caseName: caseName, traceID: traceID, received: received})
	r.mutex.Unlock()
}

func (r *perfRecorder) finishRedraws() {
	if !r.enabled() {
		return
	}
	r.mutex.Lock()
	pending := append([]redrawMarker(nil), r.pending...)
	r.pending = nil
	r.mutex.Unlock()

	finishedAt := time.Now()
	for _, marker := range pending {
		duration := finishedAt.Sub(marker.received).Nanoseconds()
		if duration < 0 {
			duration = 0
		}
		r.emit(perfRecord{
			Operation:  "frontend.response_to_redraw_finished",
			Phase:      marker.operation,
			Case:       marker.caseName,
			TraceID:    marker.traceID,
			DurationNs: duration,
			OK:         true,
		})
	}
}
