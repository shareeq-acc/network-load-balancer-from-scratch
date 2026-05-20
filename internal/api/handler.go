package api

import (
	"encoding/json"
	"fmt"
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
	pool           *balancer.BackendPool
	algorithm      string
	requests       map[string]int // URL -> request count
	mu             sync.RWMutex
	onAlgoChange   func(string) // Callback to change algorithm
	processManager ProcessManager
}

// ProcessManager interface for managing server processes
type ProcessManager interface {
	SpinUpServer() (ServerInfo, error)
	StopServerByURL(url string) error
	IsManaged(url string) bool
	GetRunningServers() []ServerInfo
}

// ServerInfo contains information about a running server
type ServerInfo struct {
	Port int
	URL  string
}

// NewHandler creates a new API handler
func NewHandler(pool *balancer.BackendPool, algorithm string, onAlgoChange func(string), pm ProcessManager) *Handler {
	requests := make(map[string]int)
	for _, backend := range pool.GetAllBackends() {
		requests[backend.URL] = 0
	}

	return &Handler{
		pool:           pool,
		algorithm:      algorithm,
		requests:       requests,
		onAlgoChange:   onAlgoChange,
		processManager: pm,
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
		URL       string `json:"url"`
		Weight    int    `json:"weight"`
		AutoStart bool   `json:"autoStart"` // New field to trigger auto-start
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If autoStart is true and no URL provided, spin up a new server
	if req.AutoStart && req.URL == "" {
		if h.processManager == nil {
			http.Error(w, "Process manager not available", http.StatusInternalServerError)
			return
		}

		serverInfo, err := h.processManager.SpinUpServer()
		if err != nil {
			log.Printf("Failed to spin up server: %v", err)
			http.Error(w, fmt.Sprintf("Failed to start server: %v", err), http.StatusInternalServerError)
			return
		}
		req.URL = serverInfo.URL
		log.Printf("Auto-started new backend server: %s", req.URL)
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
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "added",
		"url":       req.URL,
		"autoStart": req.AutoStart,
	})
}

// RemoveServer removes a backend server
func (h *Handler) RemoveServer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		URL      string `json:"url"`
		StopProc bool   `json:"stopProcess"` // New field to stop the process
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	h.pool.RemoveBackend(req.URL)
	h.mu.Lock()
	delete(h.requests, req.URL)
	h.mu.Unlock()

	// If stopProcess is true and the server is managed, stop it
	if req.StopProc && h.processManager != nil && h.processManager.IsManaged(req.URL) {
		if err := h.processManager.StopServerByURL(req.URL); err != nil {
			log.Printf("Failed to stop server process: %v", err)
		} else {
			log.Printf("Stopped server process: %s", req.URL)
		}
	}

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

// SpinUpServer creates and starts a new backend server dynamically
func (h *Handler) SpinUpServer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if h.processManager == nil {
		http.Error(w, "Process manager not available", http.StatusServiceUnavailable)
		return
	}

	var req struct {
		Weight int `json:"weight"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Weight = 1
	}
	if req.Weight <= 0 {
		req.Weight = 1
	}

	// Spin up the server
	serverInfo, err := h.processManager.SpinUpServer()
	if err != nil {
		log.Printf("Failed to spin up server: %v", err)
		http.Error(w, fmt.Sprintf("Failed to start server: %v", err), http.StatusInternalServerError)
		return
	}

	h.pool.AddBackend(balancer.Backend{URL: serverInfo.URL, Weight: req.Weight})
	h.mu.Lock()
	h.requests[serverInfo.URL] = 0
	h.mu.Unlock()

	log.Printf("Spun up and added backend: %s (weight: %d)", serverInfo.URL, req.Weight)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "created",
		"url":    serverInfo.URL,
		"port":   serverInfo.Port,
		"weight": req.Weight,
	})
}

// GetRunningServers returns information about dynamically managed servers
func (h *Handler) GetRunningServers(w http.ResponseWriter, r *http.Request) {
	if h.processManager == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"managed": false,
			"servers": []ServerInfo{},
		})
		return
	}

	servers := h.processManager.GetRunningServers()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"managed": true,
		"servers": servers,
	})
}

// UpdateServerWeight updates the weight of an existing backend server
func (h *Handler) UpdateServerWeight(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPut {
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
		http.Error(w, "Weight must be greater than 0", http.StatusBadRequest)
		return
	}

	// Update the backend weight
	if !h.pool.UpdateBackend(req.URL, req.Weight) {
		http.Error(w, "Backend not found", http.StatusNotFound)
		return
	}

	log.Printf("Backend weight updated: %s (weight: %d)", req.URL, req.Weight)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "updated",
		"url":    req.URL,
		"weight": req.Weight,
	})
}
