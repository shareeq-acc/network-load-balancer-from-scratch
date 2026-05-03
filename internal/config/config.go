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

	if len(config.Backends) == 0 {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	if config.Algorithm == "" {
		config.Algorithm = "round-robin" // Default
	}

	return &config, nil

}
