package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/shareeq-acc/load-balancer/internal/balancer"
)

// State represents the current state of the load balancer
type State struct {
	Algorithm string          `json:"algorithm"`
	Backends  []BackendStatus `json:"backends"`
}

// BackendStatus represents the status of a single backend
type BackendStatus struct {
	URL      string `json:"url"`
	Weight   int    `json:"weight"`
	Healthy  bool   `json:"healthy"`
	Requests int    `json:"requests"`
}

// Handler manages API endpoints
type Handler struct {
	pool         *balancer.BackendPool
	algorithm    string
	requests     map[string]int // URL -> request count
	mu           sync.RWMutex
	onAlgoChange func(string) // Callback to change algorithm
}

// NewHandler creates a new API handler
func NewHandler(pool *balancer.BackendPool, algorithm string, onAlgoChange func(string)) *Handler {
	requests := make(map[string]int)
	for _, backend := range pool.GetAllBackends() {
		requests[backend.URL] = 0
	}

	return &Handler{
		pool:         pool,
		algorithm:    algorithm,
		requests:     requests,
		onAlgoChange: onAlgoChange,
	}
}

// IncrementRequest increments the request count for a backend
func (h *Handler) IncrementRequest(url string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.requests[url]++
}

// GetState returns the current state
func (h *Handler) GetState(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	backends := []BackendStatus{}
	for _, backend := range h.pool.GetAllBackends() {
		backends = append(backends, BackendStatus{
			URL:      backend.URL,
			Weight:   backend.Weight,
			Healthy:  h.pool.IsHealthy(backend.URL),
			Requests: h.requests[backend.URL],
		})
	}

	state := State{
		Algorithm: h.algorithm,
		Backends:  backends,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}

// AddServer adds a new backend server
func (h *Handler) AddServer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		URL    string `json:"url"`
		Weight int    `json:"weight"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.URL == "" {
		http.Error(w, "URL is required", http.StatusBadRequest)
		return
	}
	if req.Weight <= 0 {
		req.Weight = 1
	}

	h.pool.AddBackend(balancer.Backend{URL: req.URL, Weight: req.Weight})
	h.mu.Lock()
	h.requests[req.URL] = 0
	h.mu.Unlock()

	log.Printf("Backend added: %s (weight: %d)", req.URL, req.Weight)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "added", "url": req.URL})
}

// RemoveServer removes a backend server
func (h *Handler) RemoveServer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	h.pool.RemoveBackend(req.URL)
	h.mu.Lock()
	delete(h.requests, req.URL)
	h.mu.Unlock()

	log.Printf("Backend removed: %s", req.URL)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "removed", "url": req.URL})
}

// SetAlgorithm changes the load balancing algorithm
func (h *Handler) SetAlgorithm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Algorithm string `json:"algorithm"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate algorithm
	validAlgos := map[string]bool{
		"round-robin":          true,
		"weighted-round-robin": true,
		"least-connections":    true,
	}

	if !validAlgos[req.Algorithm] {
		http.Error(w, "Invalid algorithm", http.StatusBadRequest)
		return
	}

	h.mu.Lock()
	h.algorithm = req.Algorithm
	h.mu.Unlock()

	// Call the callback to actually change the algorithm
	h.onAlgoChange(req.Algorithm)

	log.Printf("Algorithm changed to: %s", req.Algorithm)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "success",
		"algorithm": req.Algorithm,
	})
}
