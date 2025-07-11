#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Kurye App Deployment Script${NC}"
echo "=================================="
echo -e "${BLUE}📅 $(date)${NC}"

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found. Make sure you're in the backend directory.${NC}"
    exit 1
fi

# Clean up old logs first
echo -e "${YELLOW}🧹 Cleaning up old log files...${NC}"
rm -rf logs/*.log server.log 2>/dev/null || true
echo -e "${GREEN}✅ Log cleanup completed${NC}"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
    echo -e "${GREEN}✅ Environment variables loaded${NC}"
else
    echo -e "${YELLOW}⚠️ .env file not found. Using default values.${NC}"
fi

# Set default values
PORT=${PORT:-3000}
NODE_ENV=${NODE_ENV:-production}

echo -e "${BLUE}📋 Configuration:${NC}"
echo "  Port: $PORT"
echo "  Environment: $NODE_ENV"

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --production
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ npm install failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Kill any processes using port 3000
echo -e "${YELLOW}🔴 Killing processes on port 3000...${NC}"
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Stop existing PM2 processes
echo -e "${YELLOW}⏹️ Stopping existing PM2 processes...${NC}"
pm2 stop ecosystem.config.js 2>/dev/null || true
pm2 delete ecosystem.config.js 2>/dev/null || true

# Flush PM2 logs
echo -e "${YELLOW}🗑️ Flushing PM2 logs...${NC}"
pm2 flush

# Start the application
echo -e "${YELLOW}🚀 Starting application...${NC}"
pm2 start ecosystem.config.js --env production

# Check if the application started successfully
sleep 3
if pm2 list | grep -q "kurye-backend.*online"; then
    echo -e "${GREEN}✅ Application started successfully!${NC}"
    echo -e "${BLUE}📊 Application Status:${NC}"
    pm2 list
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo -e "${BLUE}📱 Application is running on port $PORT${NC}"
    echo -e "${BLUE}🔗 Health check: http://admin.enucuzal.com:$PORT/health${NC}"
    echo -e "${BLUE}👨‍💼 Admin panel: http://admin.enucuzal.com:$PORT/admin${NC}"
    echo -e "${BLUE}📷 Image upload: http://admin.enucuzal.com:$PORT/api/uploadImage${NC}"
    echo ""
    echo -e "${YELLOW}📝 Useful commands:${NC}"
    echo "  pm2 logs kurye-backend    # View logs"
    echo "  pm2 restart kurye-backend # Restart app"
    echo "  pm2 stop kurye-backend    # Stop app"
    echo "  pm2 monit                 # Monitor resources"
else
    echo -e "${RED}❌ Application failed to start!${NC}"
    echo -e "${YELLOW}📝 Checking logs...${NC}"
    pm2 logs kurye-backend --lines 20
    exit 1
fi 