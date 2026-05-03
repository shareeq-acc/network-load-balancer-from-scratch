package balancer

import (
	"net/http"
	"sync/atomic"
)

type WeightedRoundRobin struct {
	backends []Backend
	weights  []int
	counter  atomic.Int64
}

func NewWeightedRoundRobin(backends []Backend) *WeightedRoundRobin {
	var weightedBackends []Backend
	var weights []int
	for _, backend := range backends {
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
		backends: weightedBackends,
		weights:  weights,
	}
}

func (wrr *WeightedRoundRobin) SelectBackend(req *http.Request) *Backend {
	if len(wrr.backends) == 0 {
		return nil
	}

	idx := wrr.counter.Add(1) - 1
	backend := &wrr.backends[int(idx)%len(wrr.backends)]
	return backend
}

func (wrr *WeightedRoundRobin) ReleaseBackend(backend *Backend) {
	// Weighted Round-robin doesn't track connections
}
