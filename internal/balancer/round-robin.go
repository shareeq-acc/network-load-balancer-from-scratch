package balancer

import (
	"net/http"
	"sync/atomic"
)

type RoundRobin struct {
	pool    *BackendPool
	counter atomic.Int64
}

func NewRoundRobin(pool *BackendPool) *RoundRobin {
	return &RoundRobin{
		pool: pool,
	}
}

func (rr *RoundRobin) SelectBackend(req *http.Request) *Backend {

	healthyBackends := rr.pool.GetHealthyBackends()

	if len(healthyBackends) == 0 {
		return nil
	}

	idx := rr.counter.Add(1) - 1
	backend := healthyBackends[int(idx)%len(healthyBackends)]
	return &backend
}

func (rr *RoundRobin) ReleaseBackend(backend *Backend) {
	// Round-robin doesn't track connections
}
