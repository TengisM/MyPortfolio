package race

import (
	"strings"
	"time"
	"unicode"
)

// isSpace matches the characters JavaScript's trim() and \s treat as whitespace, so the name rule
// agrees with src/components/games/race-rules.ts. unicode.IsSpace differs: it counts U+0085 and
// misses U+FEFF.
func isSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0x00A0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// CleanName trims the name, collapses inner whitespace runs to one space, and reports whether the
// result is 1 to 16 letters, digits, underscores, spaces or hyphens.
func CleanName(raw string) (string, bool) {
	var b strings.Builder
	pendingSpace := false
	for _, r := range strings.TrimFunc(raw, isSpace) {
		if isSpace(r) {
			pendingSpace = true
			continue
		}
		if pendingSpace {
			b.WriteByte(' ')
			pendingSpace = false
		}
		b.WriteRune(r)
	}
	name := b.String()

	n := 0
	for _, r := range name {
		if !unicode.IsLetter(r) && !unicode.IsNumber(r) && r != '_' && r != ' ' && r != '-' {
			return "", false
		}
		n++
	}
	if n < 1 || n > 16 {
		return "", false
	}
	return name, true
}

// WeekStart returns the Monday 00:00 UTC on or before now.
func WeekStart(now time.Time) time.Time {
	now = now.UTC()
	back := (int(now.Weekday()) + 6) % 7
	return time.Date(now.Year(), now.Month(), now.Day()-back, 0, 0, 0, 0, time.UTC)
}
