package balancer

import (
	"net/http"
	"sync"
)

type LeastConnections struct {
	backends    []Backend
	connections map[string]int // URL : Count
	mu          sync.RWMutex
}

func NewLeastConnections(backends []Backend) *LeastConnections {

	connections := make(map[string]int)
	for _, backend := range backends {
		connections[backend.URL] = 0
	}

	return &LeastConnections{
		backends:    backends,
		connections: connections,
	}
}

func (lc *LeastConnections) SelectBackend(req *http.Request) *Backend {
	if len(lc.backends) == 0 {
		return nil
	}
	lc.mu.Lock()
	defer lc.mu.Unlock()

	minConnections := -1
	var selectedBackend *Backend

	for i := range lc.backends {
		backend := &lc.backends[i]
		count := lc.connections[backend.URL]

		if minConnections == -1 || count < minConnections {
			minConnections = count
			selectedBackend = backend
		}

	}

	if selectedBackend != nil {
		lc.connections[selectedBackend.URL]++
	}

	return selectedBackend
}

func (lc *LeastConnections) ReleaseBackend(backend *Backend) {
	if backend == nil {
		return
	}

	lc.mu.Lock()
	defer lc.mu.Unlock()

	count, exists := lc.connections[backend.URL]

	if exists && count > 0 {
		lc.connections[backend.URL]--
	}

}
