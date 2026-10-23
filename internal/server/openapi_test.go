package server

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/riwn/cubalyst/docs"
)

// 仕様書（docs/openapi.yaml）のパスとメソッドが、実際のルートと一致するか。
// ルートを足したり変えたりしたら、仕様書も直す。
func TestOpenAPIMatchesRoutes(t *testing.T) {
	spec := map[string]bool{}
	path := ""
	for _, line := range strings.Split(string(docs.OpenAPI), "\n") {
		if m := regexp.MustCompile(`^  (/\S+):\s*$`).FindStringSubmatch(line); m != nil {
			path = m[1]
		} else if m := regexp.MustCompile(`^    (get|put|post|patch|delete):`).FindStringSubmatch(line); m != nil && path != "" {
			spec[strings.ToUpper(m[1])+" "+path] = true
		} else if line != "" && !strings.HasPrefix(line, " ") {
			path = "" // paths: の外
		}
	}

	routes := map[string]bool{}
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range regexp.MustCompile(`HandleFunc\("([A-Z]+ /api/[^"]*)"`).FindAllStringSubmatch(string(b), -1) {
			routes[m[1]] = true
		}
	}

	var missing, extra []string
	for r := range routes {
		if !spec[r] {
			missing = append(missing, r)
		}
	}
	for s := range spec {
		if !routes[s] {
			extra = append(extra, s)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing) > 0 {
		t.Errorf("仕様書に無いルート：%v", missing)
	}
	if len(extra) > 0 {
		t.Errorf("実装に無い仕様：%v", extra)
	}
	if len(routes) == 0 {
		t.Fatal("ルートが見つからない")
	}
}

func TestOpenAPIServed(t *testing.T) {
	rec := do(t, newTestServer(t, t.TempDir()), http.MethodGet, "/api/openapi.yaml", "")
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Body.String(), "openapi: 3.1.0") {
		t.Fatalf("status=%d body=%.40q", rec.Code, rec.Body.String())
	}
}
