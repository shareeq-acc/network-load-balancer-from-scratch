package process

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"
)

// ServerProcess represents a running backend server process
type ServerProcess struct {
	Port    int
	URL     string
	Cmd     *exec.Cmd
	Started time.Time
}

// Manager manages backend server processes
type Manager struct {
	processes   map[int]*ServerProcess // port -> process
	mu          sync.RWMutex
	nextPort    int
	debugOutput bool // Show server stdout/stderr
}

// NewManager creates a new process manager
func NewManager(startPort int) *Manager {
	return &Manager{
		processes:   make(map[int]*ServerProcess),
		nextPort:    startPort,
		debugOutput: false, // Set to true to see server logs
	}
}

// SpinUpServer starts a new backend server on an available port
func (m *Manager) SpinUpServer() (*ServerProcess, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Find next available port
	port := m.nextPort
	for {
		if _, exists := m.processes[port]; !exists {
			break
		}
		port++
		if port > 65535 {
			return nil, fmt.Errorf("no available ports")
		}
	}

	// Start the backend server process
	cmd := exec.Command("go", "run", "backend/server.go")

	// CRITICAL FIX: Copy parent environment and add PORT
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", port))

	// Optionally capture output for debugging
	if m.debugOutput {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start server: %w", err)
	}

	url := fmt.Sprintf("http://localhost:%d", port)
	process := &ServerProcess{
		Port:    port,
		URL:     url,
		Cmd:     cmd,
		Started: time.Now(),
	}

	m.processes[port] = process
	m.nextPort = port + 1

	log.Printf("Started backend server on port %d (PID: %d)", port, cmd.Process.Pid)

	// Wait for the server to actually start listening
	if err := m.waitForServer(url, 5*time.Second); err != nil {
		// Server didn't start properly, kill the process
		cmd.Process.Kill()
		delete(m.processes, port)
		return nil, fmt.Errorf("server failed to start: %w", err)
	}

	log.Printf("Backend server on port %d is ready and healthy", port)

	return process, nil
}

// waitForServer waits for a server to start responding to health checks
func (m *Manager) waitForServer(url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	healthURL := url + "/health"

	for time.Now().Before(deadline) {
		resp, err := http.Get(healthURL)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(200 * time.Millisecond)
	}

	return fmt.Errorf("timeout waiting for server to respond at %s", healthURL)
}

// StopServer stops a running backend server
func (m *Manager) StopServer(port int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	process, exists := m.processes[port]
	if !exists {
		return fmt.Errorf("no server running on port %d", port)
	}

	if process.Cmd != nil && process.Cmd.Process != nil {
		if err := process.Cmd.Process.Kill(); err != nil {
			return fmt.Errorf("failed to kill process: %w", err)
		}
		log.Printf("Stopped backend server on port %d", port)
	}

	delete(m.processes, port)
	return nil
}

// StopServerByURL stops a server by its URL
func (m *Manager) StopServerByURL(url string) error {
	m.mu.RLock()
	var targetPort int
	for port, proc := range m.processes {
		if proc.URL == url {
			targetPort = port
			break
		}
	}
	m.mu.RUnlock()

	if targetPort == 0 {
		return fmt.Errorf("no server found with URL %s", url)
	}

	return m.StopServer(targetPort)
}

// GetRunningServers returns all running server processes
func (m *Manager) GetRunningServers() []*ServerProcess {
	m.mu.RLock()
	defer m.mu.RUnlock()

	servers := make([]*ServerProcess, 0, len(m.processes))
	for _, proc := range m.processes {
		servers = append(servers, proc)
	}
	return servers
}

// IsManaged checks if a URL is managed by this process manager
func (m *Manager) IsManaged(url string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, proc := range m.processes {
		if proc.URL == url {
			return true
		}
	}
	return false
}

// Shutdown stops all running servers
func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	log.Println("Shutting down all backend servers...")
	for port, proc := range m.processes {
		if proc.Cmd != nil && proc.Cmd.Process != nil {
			proc.Cmd.Process.Kill()
			log.Printf("Stopped server on port %d", port)
		}
	}
	m.processes = make(map[int]*ServerProcess)
}
