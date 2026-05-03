package health

import (
	"log"
	"net/http"
	"time"

	"github.com/shareeq-acc/load-balancer/internal/balancer"
)

type Checker struct {
	pool               *balancer.BackendPool
	interval           time.Duration
	timeout            time.Duration
	unhealthyThreshold int
	client             *http.Client
}

func NewChecker(pool *balancer.BackendPool, interval, timeout time.Duration, unhealthyThreshold int) *Checker {
	return &Checker{
		pool:               pool,
		interval:           interval,
		timeout:            timeout,
		unhealthyThreshold: unhealthyThreshold,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (hc *Checker) Start() {

	go func() {
		log.Printf("Health checker started (interval: %v, timeout: %v)", hc.interval, hc.timeout)
		ticker := time.NewTicker(hc.interval)
		defer ticker.Stop()

		hc.checkAll()

		for range ticker.C {
			hc.checkAll()
		}

	}()

}

func (hc *Checker) checkAll() {
	for _, backend := range hc.pool.GetAllBackends() {
		go hc.checkOne(backend.URL)
	}
}

func (hc *Checker) checkOne(url string) {
	resp, err := hc.client.Get(url + "/health")

	if err != nil || resp.StatusCode != http.StatusOK {
		failures := hc.pool.IncrementFailures(url)

		if failures >= hc.unhealthyThreshold {
			if hc.pool.IsHealthy(url) {
				log.Printf(" Backend %s marked UNHEALTHY", url)
				hc.pool.MarkUnhealthy(url)
			}
		}

		if resp != nil {
			resp.Body.Close()
		}
		return
	}

	resp.Body.Close()

	if !hc.pool.IsHealthy(url) {
		log.Printf("Backend %s marked HEALTHY (recovered)", url)
	}
	hc.pool.MarkHealthy(url)
}
