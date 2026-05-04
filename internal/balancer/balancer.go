package balancer

import (
	"net/http"
	"sync"
)

type Backend struct {
	URL     string
	Weight  int
	Healthy bool
}

type BackendPool struct {
	backends         []Backend
	healthy          map[string]bool
	consecutiveFails map[string]int
	mu               sync.RWMutex
}

func NewBackendPool(backends []Backend) *BackendPool {
	pool := &BackendPool{
		backends:         backends,
		healthy:          make(map[string]bool),
		consecutiveFails: make(map[string]int),
	}

	for _, backend := range backends {
		pool.healthy[backend.URL] = true
		pool.consecutiveFails[backend.URL] = 0
	}

	return pool
}

func (bp *BackendPool) GetHealthyBackends() []Backend {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	var healthyBackends []Backend

	for _, backend := range bp.backends {
		if bp.healthy[backend.URL] {
			healthyBackends = append(healthyBackends, backend)
		}
	}
	return healthyBackends
}

func (bp *BackendPool) MarkHealthy(url string) {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	bp.healthy[url] = true
	bp.consecutiveFails[url] = 0
}

func (bp *BackendPool) MarkUnhealthy(url string) {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	bp.healthy[url] = false
}

func (bp *BackendPool) IsHealthy(url string) bool {
	bp.mu.RLock()
	defer bp.mu.RUnlock()

	return bp.healthy[url]
}

func (bp *BackendPool) GetAllBackends() []Backend {
	bp.mu.RLock()
	defer bp.mu.RUnlock()

	return bp.backends
}

func (bp *BackendPool) IncrementFailures(url string) int {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	bp.consecutiveFails[url]++
	return bp.consecutiveFails[url]
}

func (bp *BackendPool) AddBackend(backend Backend) {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	bp.backends = append(bp.backends, backend)
	bp.healthy[backend.URL] = true
	bp.consecutiveFails[backend.URL] = 0
}

func (bp *BackendPool) UpdateBackend(url string, weight int) bool {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	for i, b := range bp.backends {
		if b.URL == url {
			bp.backends[i].Weight = weight
			return true
		}
	}
	return false
}

func (bp *BackendPool) RemoveBackend(url string) {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	for i, b := range bp.backends {
		if b.URL == url {
			bp.backends = append(bp.backends[:i], bp.backends[i+1:]...)
			delete(bp.healthy, url)
			delete(bp.consecutiveFails, url)
			return
		}
	}
}

type LoadBalancer interface {
	SelectBackend(req *http.Request) *Backend
	ReleaseBackend(backend *Backend)
}

func New(algorithm string, pool *BackendPool) LoadBalancer {
	switch algorithm {
	case "round-robin":
		return NewRoundRobin(pool)
	case "weighted-round-robin":
		return NewWeightedRoundRobin(pool)
	case "least-connections":
		return NewLeastConnections(pool)
	default:
		return NewRoundRobin(pool)
	}
}
