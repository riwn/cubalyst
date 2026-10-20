package analysis

import (
	"context"
	"fmt"
	"strings"
)

// Mock は開発用のLLM（CUBALYST_CLAUDE_MOCK=1）。APIを呼ばずに決まった形の結果を返す。
type Mock struct{}

func (Mock) Model() string { return "mock" }

func (Mock) Complete(_ context.Context, _, prompt string) (Completion, error) {
	lines := strings.Count(prompt, "\n")
	text := fmt.Sprintf(`## 結論（モック）
これは開発用のモック応答です。実際の解析には ANTHROPIC_API_KEY を設定してください。

## 受け取ったデータ
- 入力 %d 行

| 項目 | 内容 |
|---|---|
| モード | モック |
`, lines)
	return Completion{Text: text, Model: "mock", InputTokens: int64(len(prompt) / 4), OutputTokens: int64(len(text) / 4)}, nil
}
