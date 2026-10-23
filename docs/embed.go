// Package docs は API の仕様書（openapi.yaml）をバイナリに埋め込む。サーバーが GET /api/openapi.yaml で返す。
package docs

import _ "embed"

//go:embed openapi.yaml
var OpenAPI []byte
