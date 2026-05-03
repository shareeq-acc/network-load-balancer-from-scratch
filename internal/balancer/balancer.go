package balancer

import "net/http"

type Backend struct {
	URL    string
	Weight int
}

type LoadBalancer interface {
	SelectBackend(req *http.Request) *Backend
	ReleaseBackend(backend *Backend)
}

func New(algorithm string, backends []Backend) LoadBalancer {
	switch algorithm {
	case "round-robin":
		return NewRoundRobin(backends)

	case "weighted-round-robin":
		return NewWeightedRoundRobin(backends)

	case "least-connections":
		return NewLeastConnections(backends)

	default:
		// Default to round-robin if unknown algorithm
		return NewRoundRobin(backends)
	}
}
