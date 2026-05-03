package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/shareeq-acc/load-balancer/internal/balancer"
	"github.com/shareeq-acc/load-balancer/internal/config"
)

var lb balancer.LoadBalancer

func main() {

	cfg, err := config.LoadConfig("config.yml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	backends := make([]balancer.Backend, len(cfg.Backends))
	for i, backend := range cfg.Backends {
		backends[i] = balancer.Backend{
			URL:    backend.URL,
			Weight: backend.Weight,
		}
	}

	lb = balancer.New(cfg.Algorithm, backends)

	http.HandleFunc("/", handleRequest)

	fmt.Println("Load Balancer starting on :8080")
	fmt.Printf("Using %s Aglorithm", cfg.Algorithm)
	fmt.Printf("Backends: %d configured", len(backends))

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

}

func handleRequest(w http.ResponseWriter, r *http.Request) {

	backend := lb.SelectBackend(r)

	if backend == nil {
		log.Println("No backends available")
		http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
		return
	}

	target, err := url.Parse(backend.URL)
	if err != nil {
		log.Printf("Error parsing backend URL: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	log.Printf("Forwarding request to %s", backend.URL)
	proxy.ServeHTTP(w, r)

}
