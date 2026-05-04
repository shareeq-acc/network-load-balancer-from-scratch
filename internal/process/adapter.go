package process

import "github.com/shareeq-acc/load-balancer/internal/api"

// Adapter adapts Manager to the api.ProcessManager interface
type Adapter struct {
	manager *Manager
}

// NewAdapter creates a new adapter
func NewAdapter(manager *Manager) *Adapter {
	return &Adapter{manager: manager}
}

// SpinUpServer implements api.ProcessManager
func (a *Adapter) SpinUpServer() (api.ServerInfo, error) {
	proc, err := a.manager.SpinUpServer()
	if err != nil {
		return api.ServerInfo{}, err
	}
	return api.ServerInfo{
		Port: proc.Port,
		URL:  proc.URL,
	}, nil
}

// StopServerByURL implements api.ProcessManager
func (a *Adapter) StopServerByURL(url string) error {
	return a.manager.StopServerByURL(url)
}

// IsManaged implements api.ProcessManager
func (a *Adapter) IsManaged(url string) bool {
	return a.manager.IsManaged(url)
}

// GetRunningServers implements api.ProcessManager
func (a *Adapter) GetRunningServers() []api.ServerInfo {
	procs := a.manager.GetRunningServers()
	infos := make([]api.ServerInfo, len(procs))
	for i, proc := range procs {
		infos[i] = api.ServerInfo{
			Port: proc.Port,
			URL:  proc.URL,
		}
	}
	return infos
}
