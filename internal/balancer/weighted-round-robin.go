package balancer

import (
	"net/http"
	"sync/atomic"
)

type WeightedRoundRobin struct {
	pool    *BackendPool
	weights []Backend
	counter atomic.Int64
}

func NewWeightedRoundRobin(pool *BackendPool) *WeightedRoundRobin {
	var weightedBackends []Backend
	var weights []int
	for _, backend := range pool.GetAllBackends() {
		weight := backend.Weight
		if weight <= 0 {
			weight = 1
		}

		// Add backend weight times
		for i := 0; i < weight; i++ {
			weightedBackends = append(weightedBackends, backend)
		}
		weights = append(weights, weight)
	}

	return &WeightedRoundRobin{
		pool:    pool,
		weights: weightedBackends,
	}
}

func (wrr *WeightedRoundRobin) SelectBackend(req *http.Request) *Backend {
	if len(wrr.weights) == 0 {
		return nil
	}

	attempts := len(wrr.weights)

	for i := 0; i < attempts; i++ {
		idx := wrr.counter.Add(1) - 1
		backend := &wrr.weights[int(idx)%len(wrr.weights)]

		// Check if this backend is healthy
		if wrr.pool.IsHealthy(backend.URL) {
			return backend
		}
		// If unhealthy, try next one
	}

	return nil
}

func (wrr *WeightedRoundRobin) ReleaseBackend(backend *Backend) {
	// Weighted Round-robin doesn't track connections
}
