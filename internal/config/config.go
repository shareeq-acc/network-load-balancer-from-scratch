package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Backend struct {
	URL    string `yaml:"url"`
	Weight int    `yaml:"weight"`
}

type HealthCheck struct {
	Interval           string `yaml:"interval"`
	Timeout            string `yaml:"timeout"`
	UnhealthyThreshold int    `yaml:"unhealthy_threshold"`
}

type Config struct {
	Algorithm   string      `yaml:"algorithm"`
	Backends    []Backend   `yaml:"backends"`
	HealthCheck HealthCheck `yaml:"health_check"`
}

func LoadConfig(filename string) (*Config, error) {

	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)

	}

	var config Config
	err = yaml.Unmarshal(data, &config)

	if err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)

	}

	// An empty backend list is a valid starting state, not an error. Servers
	// are spun up and torn down while this runs — that is the point of it — so
	// beginning with none is legitimate, and in a container it is the only
	// sensible option: nothing is listening on the seeded ports until the
	// process manager starts it, and a seeded entry would collide with the
	// first server spun up on that same port.
	//
	// This previously refused to start, and reported it by formatting a nil
	// error with %w, which printed "failed to parse config file: %!w(<nil>)"
	// — wrong on both counts, since parsing had in fact succeeded.
	for i, backend := range config.Backends {
		if backend.URL == "" {
			return nil, fmt.Errorf("backend %d in %s has no url", i+1, filename)
		}
		// Weighted round-robin divides by the weight, so a zero here is not a
		// neutral default.
		if backend.Weight <= 0 {
			config.Backends[i].Weight = 1
		}
	}

	if config.Algorithm == "" {
		config.Algorithm = "round-robin" // Default
	}

	return &config, nil

}
