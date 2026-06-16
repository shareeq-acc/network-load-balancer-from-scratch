package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/shareeq-acc/load-balancer/internal/api"
	"github.com/shareeq-acc/load-balancer/internal/balancer"
	"github.com/shareeq-acc/load-balancer/internal/config"
	"github.com/shareeq-acc/load-balancer/internal/health"
	"github.com/shareeq-acc/load-balancer/internal/process"
)

var lb balancer.LoadBalancer
var pool *balancer.BackendPool
var apiHandler *api.Handler
var lbMu sync.RWMutex

func main() {
	// Load configuration
	cfg, err := config.LoadConfig("config.yml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Convert config backends to balancer backends
	backends := make([]balancer.Backend, len(cfg.Backends))
	for i, backend := range cfg.Backends {
		backends[i] = balancer.Backend{
			URL:    backend.URL,
			Weight: backend.Weight,
		}
	}

	// Create backend pool
	pool = balancer.NewBackendPool(backends)

	// Create load balancer
	lb = balancer.New(cfg.Algorithm, pool)

	// Create process manager for dynamic server spinning
	procManager := process.NewManager(8081) // Start from port 8081
	procAdapter := process.NewAdapter(procManager)

	// Create API handler with algorithm change callback and process manager
	apiHandler = api.NewHandler(pool, cfg.Algorithm, func(newAlgo string) {
		lbMu.Lock()
		defer lbMu.Unlock()
		lb = balancer.New(newAlgo, pool)
	}, procAdapter)

	// Start health checker
	checker := health.NewChecker(pool, 5*time.Second, 2*time.Second, 5)
	checker.Start()

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("\nShutting down gracefully...")
		procManager.Shutdown()
		os.Exit(0)
	}()

	// Log configuration
	fmt.Println("Load Balancer starting on :8080")
	fmt.Printf("Algorithm: %s\n", cfg.Algorithm)
	fmt.Printf("Backends: %d configured\n", len(backends))
	for i, backend := range backends {
		fmt.Printf("  [%d] %s (weight: %d)\n", i+1, backend.URL, backend.Weight)
	}
	fmt.Println("Health checking enabled")
	fmt.Println("Dynamic server spinning enabled")
	fmt.Println("Dashboard available at http://localhost:8080/")

	// API endpoints
	http.HandleFunc("/api/state", apiHandler.GetState)
	http.HandleFunc("/api/algorithm", apiHandler.SetAlgorithm)
	http.HandleFunc("/api/servers/add", apiHandler.AddServer)
	http.HandleFunc("/api/servers/remove", apiHandler.RemoveServer)
	http.HandleFunc("/api/servers/spin", apiHandler.SpinUpServer)
	http.HandleFunc("/api/servers/running", apiHandler.GetRunningServers)
	http.HandleFunc("/api/servers/update-weight", apiHandler.UpdateServerWeight)

	// Serve static files (dashboard)
	http.Handle("/", http.FileServer(http.Dir("./web")))

	// Proxy endpoint
	http.HandleFunc("/proxy", handleRequest)

	// Start server
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func handleRequest(w http.ResponseWriter, r *http.Request) {
	lbMu.RLock()
	backend := lb.SelectBackend(r)
	lbMu.RUnlock()

	if backend == nil {
		log.Println("No healthy backends available")
		http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
		return
	}

	// Track request
	apiHandler.IncrementRequest(backend.URL)

	target, err := url.Parse(backend.URL)
	if err != nil {
		log.Printf("Error parsing backend URL: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	log.Printf("Forwarding request to %s", backend.URL)
	proxy.ServeHTTP(w, r)

	defer lb.ReleaseBackend(backend)
}
