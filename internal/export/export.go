// Package export はソルブ記録の書き出し（JSON / CSV / テキスト）と読み込みを扱う。
package export

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"cubalyst/internal/solves"
)

// Version はJSON exportの形式バージョン。
const Version = 1

// Document はJSON exportの全体。
type Document struct {
	Version    int            `json:"version"`
	ExportedAt time.Time      `json:"exported_at"`
	Solves     []solves.Solve `json:"solves"`
}

// WriteJSON は回転ログと段階を含む全データを書き出す。
func WriteJSON(w io.Writer, list []solves.Solve, now time.Time) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(Document{Version: Version, ExportedAt: now.UTC(), Solves: list})
}

// ReadJSON はJSON exportを読み込む。
func ReadJSON(r io.Reader) (Document, error) {
	var doc Document
	if err := json.NewDecoder(r).Decode(&doc); err != nil {
		return doc, fmt.Errorf("invalid JSON: %w", err)
	}
	if doc.Version != Version {
		return doc, fmt.Errorf("unsupported export version %d", doc.Version)
	}
	return doc, nil
}

// EffectiveMS はペナルティ込みのタイム。DNFは -1。
func EffectiveMS(s solves.Solve) int64 {
	switch s.Penalty {
	case solves.PenaltyDNF:
		return -1
	case solves.PenaltyPlus2:
		return s.TotalMS + 2000
	}
	return s.TotalMS
}

// WriteCSV は1ソルブ1行で書き出す。段階ごとに所要時間(ms)と手数の列を持つ。
func WriteCSV(w io.Writer, list []solves.Solve) error {
	cw := csv.NewWriter(w)
	header := []string{"id", "mode", "solved_at", "total_ms", "penalty", "effective_ms", "move_count", "scramble", "case_id", "step", "note"}
	for _, st := range solves.Stages {
		header = append(header, st+"_ms", st+"_moves")
	}
	if err := cw.Write(header); err != nil {
		return err
	}
	for _, s := range list {
		eff := ""
		if e := EffectiveMS(s); e >= 0 {
			eff = strconv.FormatInt(e, 10)
		} else {
			eff = "DNF"
		}
		row := []string{
			strconv.FormatInt(s.ID, 10), s.Mode, s.SolvedAt.UTC().Format(time.RFC3339Nano),
			strconv.FormatInt(s.TotalMS, 10), s.Penalty, eff, strconv.Itoa(len(s.Moves)),
			s.Scramble, deref(s.CaseID), deref(s.Step), s.Note,
		}
		byStage := map[string]solves.Split{}
		for _, sp := range s.Splits {
			byStage[sp.Stage] = sp
		}
		for _, st := range solves.Stages {
			if sp, ok := byStage[st]; ok {
				row = append(row, strconv.FormatInt(sp.EndMS-sp.StartMS, 10), strconv.Itoa(sp.MoveCount))
			} else {
				row = append(row, "", "")
			}
		}
		if err := cw.Write(row); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

var stageLabels = map[string]string{
	"cross": "Cross", "f2l1": "F2L 1", "f2l2": "F2L 2", "f2l3": "F2L 3", "f2l4": "F2L 4", "oll": "OLL", "pll": "PLL",
}

// FormatTime は 12.345 / 1:02.345 形式。
func FormatTime(ms int64) string {
	if ms < 0 {
		return "DNF"
	}
	min := ms / 60000
	rest := ms % 60000
	sec := fmt.Sprintf("%d.%03d", rest/1000, rest%1000)
	if min > 0 {
		return fmt.Sprintf("%d:%06s", min, sec)
	}
	return sec
}

// WriteText はリコンストラクション形式（スクランブル＋段階ごとの解法＋タイム）で書き出す。
func WriteText(w io.Writer, list []solves.Solve, loc *time.Location) error {
	for i, s := range list {
		if i > 0 {
			if _, err := io.WriteString(w, "\n"); err != nil {
				return err
			}
		}
		if _, err := io.WriteString(w, Reconstruction(s, loc)); err != nil {
			return err
		}
	}
	return nil
}

// Reconstruction は1ソルブ分のテキスト。
func Reconstruction(s solves.Solve, loc *time.Location) string {
	var b strings.Builder
	title := FormatTime(EffectiveMS(s))
	switch s.Penalty {
	case solves.PenaltyPlus2:
		title += fmt.Sprintf(" (%s+2)", FormatTime(s.TotalMS))
	case solves.PenaltyDNF:
		title += fmt.Sprintf(" (%s)", FormatTime(s.TotalMS))
	}
	kind := s.Mode
	if s.CaseID != nil {
		kind += " " + *s.CaseID
	}
	if s.Step != nil {
		kind += " " + *s.Step
	}
	fmt.Fprintf(&b, "#%d %s  %s  [%s]\n", s.ID, s.SolvedAt.In(loc).Format("2006-01-02 15:04:05"), title, kind)
	fmt.Fprintf(&b, "Scramble: %s\n", s.Scramble)
	if len(s.Splits) > 0 {
		b.WriteString("\n")
		for _, sp := range s.Splits {
			moves := movesIn(s.Moves, sp.StartIndex, sp.EndIndex)
			fmt.Fprintf(&b, "%-6s %s  // %s, %d moves\n", stageLabels[sp.Stage]+":", orDash(moves),
				FormatTime(sp.EndMS-sp.StartMS), sp.MoveCount)
		}
	} else if len(s.Moves) > 0 {
		fmt.Fprintf(&b, "\nSolution: %s\n", movesIn(s.Moves, 0, len(s.Moves)))
	}
	n := len(s.Moves)
	tps := 0.0
	if s.TotalMS > 0 {
		tps = float64(n) / (float64(s.TotalMS) / 1000)
	}
	fmt.Fprintf(&b, "\nTotal: %s / %d moves / %.2f TPS\n", FormatTime(s.TotalMS), n, tps)
	if s.Note != "" {
		fmt.Fprintf(&b, "Note: %s\n", s.Note)
	}
	return b.String()
}

func movesIn(moves []solves.Move, from, to int) string {
	if from < 0 {
		from = 0
	}
	if to > len(moves) {
		to = len(moves)
	}
	parts := make([]string, 0, to-from)
	for _, m := range moves[from:to] {
		parts = append(parts, m.Move)
	}
	return strings.Join(parts, " ")
}

func orDash(s string) string {
	if s == "" {
		return "(skip)"
	}
	return s
}
