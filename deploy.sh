#!/bin/bash

# Flixify Production Deployment Script
# Usage: ./deploy.sh [backend|frontend|all]

set -e

DEPLOY_TARGET=${1:-all}
echo "🚀 Flixify Deployment - Target: $DEPLOY_TARGET"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    log_warn ".env.production not found!"
    log_info "Creating from template..."
    cp .env.production.example .env.production
    log_error "Please edit .env.production with your actual values and run again!"
    exit 1
fi

# Build and deploy backend
build_backend() {
    log_info "Building Backend..."
    
    # Install dependencies
    npm ci --only=production
    
    log_info "Backend build complete!"
}

# Build and deploy frontend
build_frontend() {
    log_info "Building Frontend..."
    
    cd frontend
    
    # Install dependencies
    npm ci
    
    # Build
    npm run build
    
    log_info "Frontend build complete!"
    
    cd ..
}

# Main deployment logic
case $DEPLOY_TARGET in
    backend)
        build_backend
        log_info "Backend ready for deployment!"
        log_info "Docker image build: docker build -t flixify-backend ."
        ;;
    frontend)
        build_frontend
        log_info "Frontend ready for deployment!"
        log_info "Docker image build: docker build -t flixify-frontend ./frontend"
        ;;
    all)
        build_backend
        build_frontend
        log_info "All builds complete!"
        log_info "To deploy with Coolify, push to GitHub and deploy from Coolify dashboard"
        ;;
    *)
        echo "Usage: ./deploy.sh [backend|frontend|all]"
        exit 1
        ;;
esac

log_info "✅ Deployment preparation complete!"
