# Go Load Balancer with Dynamic Server Management

A production-ready HTTP load balancer built in Go with a modern web dashboard for real-time visualization and management. Features dynamic server spinning, multiple load balancing algorithms, health checking, and an interactive UI.

## ✨ Features

### Load Balancing Algorithms
- **Round Robin** - Distributes requests evenly across all healthy backends
- **Weighted Round Robin** - Distributes requests based on server weights
- **Least Connections** - Routes to the server with fewest active connections

### Dynamic Server Management
- **Spin Up Servers** - Create and start backend servers on-demand from the UI
- **Process Management** - Automatic lifecycle management of spawned servers
- **Graceful Shutdown** - Clean termination of all managed processes
- **Port Auto-Assignment** - Automatically finds and assigns available ports

### Health Checking
- **Active Health Checks** - Periodic health checks every 5 seconds
- **Automatic Failover** - Unhealthy servers removed from rotation
- **Auto-Recovery** - Servers automatically rejoin when healthy
- **Configurable Thresholds** - 3 consecutive failures trigger unhealthy state

### Web Dashboard
- **Real-time Visualization** - See traffic flow with animated request packets
- **Interactive Controls** - Drag servers, change algorithms, simulate traffic
- **Server Details Modal** - Click info icon to view/edit server details
- **Weight Management** - Update server weights dynamically
- **Statistics Tracking** - Monitor requests, connections, and server health
- **Responsive Design** - Modern UI with dark theme

### API Management
- **RESTful API** - Full control via HTTP endpoints
- **State Management** - Get current load balancer state
- **Dynamic Configuration** - Add/remove servers and change algorithms at runtime
- **Weight Updates** - Modify server weights without restart

## 🚀 Quick Start

### Prerequisites
- **Go 1.26+** installed
- **Docker** (optional, for containerized deployment)

### Option 1: Run Locally

1. **Clone the repository**
```bash
git clone https://github.com/shareeq-acc/load-balancer.git
cd load-balancer
```

2. **Install dependencies**
```bash
go mod download
```

3. **Start the load balancer**
```bash
go run cmd/main.go
```

4. **Open the dashboard**
```
http://localhost:8080
```

5. **Spin up backend servers**
   - Click the **"⚡ Spin Up Server"** button in the UI
   - Or manually start servers:
   ```bash
   # Terminal 1
   PORT=8081 go run backend/server.go
   
   # Terminal 2
   PORT=8082 go run backend/server.go
   
   # Terminal 3
   PORT=8083 go run backend/server.go
   ```

### Option 2: Run with Docker

1. **Build the image**
```bash
docker build -t load-balancer .
```

2. **Run the container**
```bash
docker run -p 8080:8080 -v $(pwd)/config.yml:/app/config.yml load-balancer
```

3. **Access the dashboard**
```
http://localhost:8080
```

## 📁 Project Structure

```
.
├── cmd/
│   └── main.go                    # Application entry point
├── backend/
│   └── server.go                  # Backend server implementation
├── internal/
│   ├── api/
│   │   └── handler.go             # REST API handlers
│   ├── balancer/
│   │   ├── balancer.go            # Load balancer interface & pool
│   │   ├── round-robin.go         # Round robin algorithm
│   │   ├── weighted-round-robin.go # Weighted round robin
│   │   └── least-connection.go    # Least connections algorithm
│   ├── config/
│   │   └── config.go              # Configuration management
│   ├── health/
│   │   └── checker.go             # Health checking system
│   └── process/
│       ├── manager.go             # Process lifecycle management
│       └── adapter.go             # API adapter
├── web/
│   ├── index.html                 # Dashboard UI
│   └── app.js                     # Frontend logic
├── config.yml                     # Configuration file
├── Dockerfile                     # Docker build configuration
├── go.mod                         # Go module definition
└── go.sum                         # Go dependencies
```

## ⚙️ Configuration

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

**Configuration Options:**
- `algorithm`: Load balancing algorithm (`round-robin`, `weighted-round-robin`, `least-connections`)
- `backends`: List of backend servers
  - `url`: Backend server URL
  - `weight`: Server weight (used in weighted round robin)

## 🌐 API Endpoints

### Load Balancer
- `GET /` - Web dashboard
- `GET /proxy` - Proxy endpoint for load balancing

### Management API

#### Get State
```bash
GET /api/state
```
Returns current load balancer state including algorithm, backends, and health status.

#### Change Algorithm
```bash
POST /api/algorithm
Content-Type: application/json

{
  "algorithm": "least-connections"
}
```

#### Add Server
```bash
POST /api/servers/add
Content-Type: application/json

{
  "url": "http://localhost:8084",
  "weight": 1
}
```

#### Remove Server
```bash
DELETE /api/servers/remove
Content-Type: application/json

{
  "url": "http://localhost:8081",
  "stopProcess": true
}
```

#### Spin Up Server (Dynamic)
```bash
POST /api/servers/spin
Content-Type: application/json

{
  "weight": 1
}
```
Automatically starts a new backend server and adds it to the pool.

#### Update Server Weight
```bash
PATCH /api/servers/update-weight
Content-Type: application/json

{
  "url": "http://localhost:8081",
  "weight": 3
}
```

#### Get Running Servers
```bash
GET /api/servers/running
```
Returns list of dynamically managed servers.

## 🎮 Using the Dashboard

### Getting Started
1. Open `http://localhost:8080` in your browser
2. You'll see the load balancer node in the center
3. Backend servers appear at the bottom (if configured)

### Spinning Up Servers
- Click **"⚡ Spin Up Server"** to create a new backend server
- The server starts automatically and appears in the visualization
- Health checks begin immediately

### Adding Existing Servers
- Click **"+ Add Existing"**
- Enter the URL of a running server
- Set the weight (for weighted round robin)
- Click "Add Server"

### Viewing Server Details
- Click the **ℹ️ icon** on any server node
- View server information: name, URL, status, connections, requests
- Update the server weight
- Kill/revive or remove the server

### Simulating Traffic
1. Set **Number of requests** (1-200)
2. Set **Delay between requests** (50-3000ms)
3. Set **Processing time** (200-8000ms)
4. Click **"▶ Simulate"**
5. Watch animated packets flow from client → LB → servers

### Changing Algorithms
- Click any algorithm button in the sidebar
- Changes apply immediately to new requests
- Watch how different algorithms distribute traffic

### Managing Servers
- **Drag & Drop** - Reposition servers in the visualization
- **Kill** - Temporarily disable a server (simulates failure)
- **Revive** - Re-enable a killed server
- **Remove (✕)** - Remove server from pool (stops process if dynamic)

## 🏗️ Architecture

### Request Flow
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

### Components

**Load Balancer Core**
- Implements multiple algorithms
- Thread-safe backend pool management
- Connection tracking for least connections

**Health Checker**
- Runs in background goroutine
- Checks `/health` endpoint on each backend
- Marks servers unhealthy after 3 consecutive failures
- Automatically recovers healthy servers

**Process Manager**
- Spawns backend servers as child processes
- Manages port allocation (starts from 8081)
- Waits for server readiness before adding to pool
- Graceful shutdown on SIGINT/SIGTERM

**API Handler**
- RESTful endpoints for management
- Request counting and statistics
- Dynamic configuration updates

## 🔍 Health Checking

**Configuration:**
- **Interval:** 5 seconds
- **Timeout:** 2 seconds per check
- **Threshold:** 3 consecutive failures
- **Endpoint:** `/health` on each backend

**Behavior:**
- Servers start as healthy
- Failed checks increment failure counter
- 3 failures → marked unhealthy → removed from rotation
- Successful check → reset counter → marked healthy

## 🛠️ Development

### Building
```bash
go build -o load-balancer ./cmd/main.go
```

### Running Tests
```bash
go test ./...
```

### Building Docker Image
```bash
docker build -t load-balancer .
```

### Code Structure
- **cmd/** - Application entry points
- **internal/** - Private application code
- **backend/** - Backend server implementation
- **web/** - Frontend assets

## 🐳 Docker Deployment

### Build and Run
```bash
# Build image
docker build -t load-balancer .

# Run container
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/config.yml:/app/config.yml \
  --name load-balancer \
  load-balancer
```

### View Logs
```bash
docker logs -f load-balancer
```

### Stop Container
```bash
docker stop load-balancer
docker rm load-balancer
```

## 📊 Monitoring

### Logs
The load balancer logs:
- Server startup and configuration
- Request routing decisions
- Health check results
- Server lifecycle events (add/remove/kill/revive)
- Algorithm changes
- Errors and warnings

### Statistics
Available in the dashboard:
- **Total Requests** - All requests processed
- **Servers Up** - Number of healthy servers
- **Servers Down** - Number of unhealthy servers
- **In Flight** - Currently processing requests

Per-server statistics:
- **Active Connections** - Current active requests
- **Total Requests** - Lifetime request count
- **Weight** - Server weight (for weighted algorithms)
- **Status** - UP or DOWN

## 🧪 Testing

### Manual Testing
1. Start the load balancer
2. Spin up 3 servers from the UI
3. Run simulation with 20 requests
4. Kill one server and observe failover
5. Revive the server and verify it rejoins
6. Change algorithms and compare distribution

### API Testing
```bash
# Get current state
curl http://localhost:8080/api/state

# Spin up a server
curl -X POST http://localhost:8080/api/servers/spin \
  -H "Content-Type: application/json" \
  -d '{"weight": 1}'

# Send requests through proxy
for i in {1..10}; do
  curl http://localhost:8080/proxy
done

# Change algorithm
curl -X POST http://localhost:8080/api/algorithm \
  -H "Content-Type: application/json" \
  -d '{"algorithm": "least-connections"}'
```

## 🔒 Production Considerations

For production deployment:

1. **Security**
   - Add authentication/authorization
   - Use HTTPS/TLS
   - Implement rate limiting
   - Validate all inputs

2. **Reliability**
   - Add circuit breaker pattern
   - Implement retry logic
   - Use persistent storage for state
   - Add metrics and monitoring

3. **Performance**
   - Tune health check intervals
   - Optimize connection pooling
   - Add caching layer
   - Use production-grade reverse proxy

4. **Operations**
   - Set up logging aggregation
   - Configure alerts
   - Implement graceful deployments
   - Add backup/restore procedures

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional load balancing algorithms (IP hash, random, etc.)
- Persistent state storage
- Metrics and monitoring integration
- Circuit breaker implementation
- Rate limiting
- SSL/TLS termination
- WebSocket support
- gRPC support

## 📝 License

MIT License - feel free to use this project for learning and production!

## 🎯 Use Cases

- **Learning** - Understand load balancing concepts
- **Development** - Test distributed applications locally
- **Microservices** - Route traffic between service instances
- **High Availability** - Distribute load across multiple servers
- **Failover Testing** - Simulate server failures
- **Performance Testing** - Test application under load

## 🙏 Acknowledgments

Built with:
- Go standard library
- gopkg.in/yaml.v3 for configuration
- Vanilla JavaScript (no frameworks!)
- Modern CSS with custom properties
- SVG for connection visualization

---

**Made with ❤️ using Go**

For questions or issues, please open an issue on GitHub.
