package balancer

import (
	"net/http"
	"sync/atomic"
)

type RoundRobin struct {
	backends []Backend
	counter  atomic.Int64
}

func NewRoundRobin(backends []Backend) *RoundRobin {
	return &RoundRobin{
		backends: backends,
	}
}

func (rr *RoundRobin) SelectBackend(req *http.Request) *Backend {
	if len(rr.backends) == 0 {
		return nil
	}
	idx := rr.counter.Add(1) - 1
	backend := rr.backends[int(idx)%len(rr.backends)]
	return &backend
}

func (rr *RoundRobin) ReleaseBackend(backend *Backend) {
	// Round-robin doesn't track connections
}
