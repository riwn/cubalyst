package config

import "testing"

func TestLoopbackOnly(t *testing.T) {
	for _, addr := range []string{"127.0.0.1:8080", "localhost:8080", "[::1]:8080"} {
		if _, err := Load([]string{"-addr", addr}); err != nil {
			t.Errorf("%s: unexpected error: %v", addr, err)
		}
	}
	for _, addr := range []string{"0.0.0.0:8080", ":8080", "192.168.1.10:8080"} {
		if _, err := Load([]string{"-addr", addr}); err == nil {
			t.Errorf("%s: expected error", addr)
		}
	}
}
