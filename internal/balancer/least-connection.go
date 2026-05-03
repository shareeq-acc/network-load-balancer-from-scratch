package balancer

import (
	"net/http"
	"sync"
)

type LeastConnections struct {
	pool        *BackendPool
	connections map[string]int
	mu          sync.RWMutex
}

func NewLeastConnections(pool *BackendPool) *LeastConnections {
	connections := make(map[string]int)

	for _, backend := range pool.GetAllBackends() {
		connections[backend.URL] = 0
	}

	return &LeastConnections{
		pool:        pool,
		connections: connections,
	}
}

func (lc *LeastConnections) SelectBackend(req *http.Request) *Backend {
	lc.mu.Lock()
	defer lc.mu.Unlock()

	// Get only healthy backends
	healthyBackends := lc.pool.GetHealthyBackends()

	if len(healthyBackends) == 0 {
		return nil
	}

	minConnections := -1
	var selectedBackend *Backend

	for i := range healthyBackends {
		backend := &healthyBackends[i]
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
