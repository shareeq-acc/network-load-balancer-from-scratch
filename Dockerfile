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

# Build the backend server
RUN CGO_ENABLED=0 GOOS=linux go build -o backend-server ./backend/server.go

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the binaries from builder
COPY --from=builder /app/load-balancer .
COPY --from=builder /app/backend-server .

# Copy web files
COPY web ./web

# Copy config
COPY config.yml .

# Expose port
EXPOSE 8080

# Run the load balancer
CMD ["./load-balancer"]
