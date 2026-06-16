# Build stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the load balancer
RUN CGO_ENABLED=0 GOOS=linux go build -o load-balancer ./cmd/main.go

# Runtime stage
FROM golang:1.26-alpine

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/load-balancer .

# Copy web files
COPY web ./web

# Copy config
COPY config.yml .

# Copy backend source code (required for dynamically spinning up servers)
COPY backend ./backend

# Expose port
EXPOSE 8080

# Run the load balancer
CMD ["./load-balancer"]
