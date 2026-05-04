# Load Balancer with Dynamic Server Spinning

A feature-rich load balancer implementation in Go with a beautiful web UI and **dynamic server spinning** capabilities.

## ✨ Features

### Core Load Balancing
- **Multiple Algorithms**
  - Round Robin
  - Weighted Round Robin
  - Least Connections
- **Health Checking** - Automatic backend health monitoring
- **Dynamic Configuration** - Change algorithms and backends on the fly
- **Reverse Proxy** - Efficient request forwarding

### 🚀 Dynamic Server Spinning (NEW!)
- **Spin up servers from the UI** - No need to manually start backend servers
- **Automatic port management** - System finds available ports automatically
- **Process lifecycle management** - Start, stop, and monitor servers
- **Graceful shutdown** - All processes cleaned up properly
- **Mixed mode** - Use both dynamic and manually-started servers

### Web Dashboard
- **Real-time visualization** - See traffic flow in action
- **Interactive controls** - Drag servers, change algorithms, simulate traffic
- **Server management** - Add, remove, kill, and revive servers
- **Statistics tracking** - Monitor requests, connections, and server health
- **Beautiful UI** - Modern, responsive design with animations

## 🎯 Quick Start

### Prerequisites
- Go 1.26+ installed
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd load-balancer
```

2. Install dependencies:
```bash
go mod download
```

3. Start the load balancer:
```bash
go run cmd/main.go
```

4. Open the dashboard:
```
http://localhost:8080
```

### Using Dynamic Server Spinning

1. **From the UI:**
   - Click the **"⚡ Spin Up Server"** button
   - Watch as a new backend server starts automatically
   - The server appears in the visualization immediately

2. **From the API:**
```bash
curl -X POST http://localhost:8080/api/servers/spin \
  -H "Content-Type: application/json" \
  -d '{"weight": 1}'
```

3. **Simulate Traffic:**
   - Set number of requests and delay
   - Click **"▶ Simulate"**
   - Watch requests flow through the load balancer

## 📁 Project Structure

```
.
├── cmd/
│   └── main.go                 # Application entry point
├── backend/
│   └── server.go               # Backend server implementation
├── internal/
│   ├── api/
│   │   └── handler.go          # API endpoints
│   ├── balancer/
│   │   ├── balancer.go         # Load balancer interface
│   │   ├── round-robin.go      # Round robin implementation
│   │   ├── weighted-round-robin.go
│   │   └── least-connection.go
│   ├── config/
│   │   └── config.go           # Configuration management
│   ├── health/
│   │   └── checker.go          # Health checking
│   └── process/
│       ├── manager.go          # Process lifecycle management
│       └── adapter.go          # API adapter
├── web/
│   ├── index.html              # Dashboard UI
│   └── app.js                  # Frontend logic
├── config.yml                  # Configuration file
└── go.mod
```

## 🔧 Configuration

Edit `config.yml` to configure initial backends:

```yaml
algorithm: round-robin

backends:
- url: http://localhost:8081
  weight: 1
- url: http://localhost:8082
  weight: 1
- url: http://localhost:8083
  weight: 1
```

## 🌐 API Endpoints

### Load Balancer
- `GET /` - Web dashboard
- `GET /proxy` - Proxy endpoint for load balancing

### Management API
- `GET /api/state` - Get current state
- `POST /api/algorithm` - Change algorithm
- `POST /api/servers/add` - Add a backend server
- `DELETE /api/servers/remove` - Remove a backend server
- `POST /api/servers/spin` - **Spin up a new server dynamically**
- `GET /api/servers/running` - **Get list of managed servers**

### Examples

**Change Algorithm:**
```bash
curl -X POST http://localhost:8080/api/algorithm \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "least-connections"}'
```

**Spin Up Server:**
```bash
curl -X POST http://localhost:8080/api/servers/spin \
  -H "Content-Type: application/json" \
  -d '{"weight": 1}'
```

**Add Existing Server:**
```bash
curl -X POST http://localhost:8080/api/servers/add \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:8084", "weight": 1}'
```

**Remove Server:**
```bash
curl -X DELETE http://localhost:8080/api/servers/remove \
  -H "Content-Type: application/json" \
  -d '{"url": "http://localhost:8081", "stopProcess": true}'
```

## 🎮 Dashboard Features

### Algorithm Selection
- Click algorithm buttons to switch between strategies
- Changes apply immediately to new requests

### Server Management
- **⚡ Spin Up Server** - Create and start a new backend
- **+ Add Existing** - Add a manually running server
- **Kill/Revive** - Toggle server availability
- **✕ Remove** - Remove server (stops process if dynamic)
- **Drag & Drop** - Reposition servers in the visualization

### Simulation
- Configure request count, delay, and processing time
- Watch animated packets flow from client → LB → servers
- Real-time statistics and connection tracking

### Statistics
- Total requests processed
- Servers up/down count
- In-flight requests
- Per-server active connections and totals

## 🏗️ Architecture

### Load Balancing Flow
```
Client Request
    ↓
Load Balancer (Algorithm Selection)
    ↓
Health Check Filter
    ↓
Selected Backend Server
    ↓
Response
```

### Dynamic Server Spinning
```
UI Button Click / API Call
    ↓
Process Manager
    ↓
Find Available Port
    ↓
Spawn Go Process (backend/server.go)
    ↓
Add to Backend Pool
    ↓
Start Health Checking
    ↓
Server Ready
```

## 🧪 Testing

Run the test script:
```bash
bash test-dynamic-servers.sh
```

Or test manually:
1. Start the load balancer
2. Spin up 3 servers from the UI
3. Run simulation with 20 requests
4. Kill one server and observe failover
5. Spin up a replacement server
6. Verify traffic distribution

## 🔍 Health Checking

- **Interval:** 5 seconds
- **Timeout:** 2 seconds
- **Threshold:** 3 consecutive failures
- **Endpoint:** `/health` on each backend
- **Auto-recovery:** Servers automatically rejoin when healthy

## 🛡️ Graceful Shutdown

Press `Ctrl+C` to trigger graceful shutdown:
1. Stop accepting new requests
2. Kill all managed backend processes
3. Clean up resources
4. Exit

## 📚 Documentation

- [Dynamic Server Spinning Guide](DYNAMIC_SERVERS.md) - Detailed feature documentation
- [API Reference](#-api-endpoints) - Complete API documentation

## 🚀 Advanced Usage

### Running Backend Servers Manually

If you prefer to manage servers yourself:

```bash
# Terminal 1
PORT=8081 go run backend/server.go

# Terminal 2
PORT=8082 go run backend/server.go

# Terminal 3
PORT=8083 go run backend/server.go
```

Then add them via the UI using **"+ Add Existing"**.

### Custom Backend Implementation

Create your own backend server that responds to:
- `GET /health` - Health check endpoint (return 200 OK)
- `GET /*` - Handle requests

### Monitoring

Watch logs for:
- Request routing decisions
- Health check results
- Server lifecycle events
- Algorithm changes

## 🤝 Contributing

Contributions welcome! Areas for improvement:
- Docker container support for backends
- Persistent process tracking
- Auto-scaling based on load
- Metrics and monitoring dashboard
- SSL/TLS support
- Rate limiting
- Circuit breaker pattern

## 📝 License

MIT License - feel free to use this project for learning and production!

## 🎉 Acknowledgments

Built with:
- Go standard library
- Vanilla JavaScript (no frameworks!)
- Modern CSS with custom properties
- SVG for connection visualization

---

**Happy Load Balancing! ⚡**
