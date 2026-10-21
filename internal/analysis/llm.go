// Package analysis はClaudeによるソルブ解析（入力データの整形、API呼び出し、結果の保存）を扱う。
package analysis

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

// ErrNotConfigured はAPIキーが設定されていないことを表す。
var ErrNotConfigured = errors.New("ANTHROPIC_API_KEY が設定されていません。サーバーを環境変数 ANTHROPIC_API_KEY 付きで起動してください")

// Completion はLLMの応答。
type Completion struct {
	Text         string
	Model        string
	InputTokens  int64
	OutputTokens int64
}

// LLM はテキストを1回生成するクライアント（テストではフェイクに差し替える）。
type LLM interface {
	Complete(ctx context.Context, system, prompt string) (Completion, error)
	Model() string
}

const (
	DefaultModel  = "claude-opus-5-5"
	DefaultEffort = "high"
	maxTokens     = 16000
)

// Claude は Claude API を使う LLM。
type Claude struct {
	client anthropic.Client
	model  string
	effort anthropic.BetaOutputConfigEffort
	// workspaceID はワークスペースに紐付いていないAPIキーのとき、使うワークスペースを指定する。
	workspaceID string
}

// NewClaudeFromEnv は環境変数から設定を読む。ANTHROPIC_API_KEY が無ければ ErrNotConfigured。
//
//	ANTHROPIC_API_KEY（必須） / ANTHROPIC_WORKSPACE_ID（キーがワークスペースに紐付いていない場合）
//	CUBALYST_CLAUDE_MODEL（既定 claude-opus-5-5） / CUBALYST_CLAUDE_EFFORT（既定 high）
func NewClaudeFromEnv() (*Claude, error) {
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		return nil, ErrNotConfigured
	}
	model := envOr("CUBALYST_CLAUDE_MODEL", DefaultModel)
	effort := anthropic.BetaOutputConfigEffort(envOr("CUBALYST_CLAUDE_EFFORT", DefaultEffort))
	switch effort {
	case "low", "medium", "high", "xhigh", "max":
	default:
		return nil, fmt.Errorf("CUBALYST_CLAUDE_EFFORT %q は low/medium/high/xhigh/max のいずれかにしてください", effort)
	}
	return &Claude{
		client:      anthropic.NewClient(),
		model:       model,
		effort:      effort,
		workspaceID: os.Getenv("ANTHROPIC_WORKSPACE_ID"),
	}, nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func (c *Claude) Model() string { return c.model }

// Complete は1回のリクエストで解析結果を得る。
// 安全分類による拒否に備えて、サーバー側フォールバック（fallbacks: "default"）を有効にしている。
func (c *Claude) Complete(ctx context.Context, system, prompt string) (Completion, error) {
	params := anthropic.BetaMessageNewParams{
		Model:        anthropic.Model(c.model),
		MaxTokens:    maxTokens,
		System:       []anthropic.BetaTextBlockParam{{Text: system}},
		Messages:     []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(prompt))},
		OutputConfig: anthropic.BetaOutputConfigParam{Effort: c.effort},
		Fallbacks:    anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()},
		Betas:        []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	}
	if c.workspaceID != "" {
		params.WorkspaceID = anthropic.String(c.workspaceID)
	}
	resp, err := c.client.Beta.Messages.New(ctx, params)
	if err != nil {
		var apierr *anthropic.Error
		if errors.As(err, &apierr) {
			return Completion{}, fmt.Errorf("Claude API エラー（HTTP %d）: %w", apierr.StatusCode, err)
		}
		return Completion{}, fmt.Errorf("Claude API に接続できません: %w", err)
	}
	switch resp.StopReason {
	case anthropic.BetaStopReasonRefusal:
		return Completion{}, fmt.Errorf("Claudeが解析を断りました（%s）", resp.StopDetails.Category)
	case anthropic.BetaStopReasonMaxTokens:
		return Completion{}, errors.New("解析結果が長すぎて途中で切れました")
	}
	var b strings.Builder
	for _, block := range resp.Content {
		if t, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			b.WriteString(t.Text)
		}
	}
	text := strings.TrimSpace(b.String())
	if text == "" {
		return Completion{}, errors.New("Claudeの応答が空でした")
	}
	return Completion{
		Text:         text,
		Model:        string(resp.Model),
		InputTokens:  resp.Usage.InputTokens,
		OutputTokens: resp.Usage.OutputTokens,
	}, nil
}
