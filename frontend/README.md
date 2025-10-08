# ConvoChat Frontend

A modern, scalable React TypeScript frontend application with comprehensive CI/CD, Docker containerization, and production-ready deployment configurations.

## 🚀 Quick Start

Get up and running in minutes:

```bash
# Clone and setup (if not already done)
git clone <your-repo-url>
cd convo-frontend

# Quick setup with our automated script
./scripts/quickstart.sh --dev

# Or manual setup
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

## ✨ Features

### Core Features
- 🏗️ **Modern React 18** with TypeScript
- 🎨 **Responsive Design** with modern UI components
- 🔄 **Real-time Communication** via WebSockets
- 🔐 **Authentication & Authorization** with JWT
- 📱 **Progressive Web App (PWA)** support
- 🌍 **Internationalization (i18n)** ready

### Development Experience
- ⚡ **Fast Development** with Vite and HMR
- 🧪 **Comprehensive Testing** with Vitest and Testing Library
- 📏 **Code Quality** with ESLint, Prettier, and Husky
- 🔍 **Type Safety** with TypeScript strict mode
- 📊 **Bundle Analysis** and performance monitoring

### Production Ready
- 🐳 **Docker** containerization with multi-stage builds
- 🚀 **CI/CD Pipeline** with GitHub Actions
- 📈 **Monitoring** with Prometheus and health checks
- 🔒 **Security** headers and CSP policies
- 📦 **Multi-environment** deployment support
- ☸️ **Kubernetes** manifests included

## 🛠 Tech Stack

### Frontend
- **React 18** - UI library with concurrent features
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **React Router** - Client-side routing
- **Zustand/Redux** - State management
- **React Query** - Server state management
- **Tailwind CSS** - Utility-first CSS framework

### Development & Testing
- **Vitest** - Unit testing framework
- **Testing Library** - React component testing
- **Playwright** - E2E testing
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Husky** - Git hooks

### Infrastructure
- **Docker** - Containerization
- **Nginx** - Web server and reverse proxy
- **GitHub Actions** - CI/CD pipeline
- **Prometheus** - Metrics collection
- **Loki** - Log aggregation

## 📚 Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Docker** >= 20.0.0 (optional, for containerization)
- **Git** for version control

## 🔧 Installation

### Method 1: Quick Start Script (Recommended)

```bash
# Full setup with development server
./scripts/quickstart.sh --dev

# Setup with Docker
./scripts/quickstart.sh --docker --dev

# Custom setup options
./scripts/quickstart.sh --skip-test --dev
```

### Method 2: Manual Setup

```bash
# Install dependencies
npm ci

# Copy environment configuration
cp .env.example .env.local

# Build the application
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

### Method 3: Using Make

```bash
# View all available commands
make help

# Full setup
make setup

# Start development
make dev
```

## 💻 Development

### Starting the Development Server

```bash
# Standard development
npm run dev

# With Docker
./scripts/dev.sh

# Full stack (if backend available)
./scripts/dev.sh --backend
```

### Development Commands

```bash
# Code quality
npm run lint          # Run linter
npm run lint:fix       # Fix linting issues
npm run format         # Format code with Prettier
npm run type-check     # TypeScript type checking

# Testing
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
npm run test:e2e      # End-to-end tests

# Build
npm run build         # Production build
npm run preview       # Preview production build
```

## 🧪 Testing

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# Specific test file
npm test -- Button.test.tsx
```

### End-to-End Tests

```bash
# Run E2E tests
npm run test:e2e

# Interactive mode
npm run test:e2e:ui

# Specific browser
npm run test:e2e -- --project=chromium
```

## 🐳 Docker

### Development with Docker

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# Or using the script
./scripts/dev.sh
```

### Production with Docker

```bash
# Build production image
docker build -t convochat-frontend .

# Run production container
docker run -p 8080:8080 convochat-frontend

# Using Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

## 🚀 Deployment

### Quick Deploy Options

```bash
# Development
./scripts/deploy.sh development

# Staging
./scripts/deploy.sh staging

# Production (with safety checks)
./scripts/production-deploy.sh
```

### Using Make Commands

```bash
make deploy-dev        # Development
make deploy-staging    # Staging  
make deploy-prod       # Production
```

### Kubernetes

```bash
# Deploy to Kubernetes
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
```

## 📁 Project Structure

```
convo-frontend/
├── .github/workflows/     # GitHub Actions CI/CD
├── config/               # Configuration files
├── k8s/                  # Kubernetes manifests
├── scripts/              # Build and deployment scripts
├── src/                  # Source code
│   ├── components/       # Reusable components
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Page components
│   ├── services/        # API and external services
│   ├── stores/          # State management
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── Dockerfile           # Production Docker image
├── docker-compose.yml   # Docker Compose configs
├── Makefile             # Common development tasks
└── package.json         # Dependencies and scripts
```

## 📜 Scripts

### Custom Scripts

- `scripts/quickstart.sh` - Quick project setup
- `scripts/dev.sh` - Development environment
- `scripts/deploy.sh` - Multi-environment deployment
- `scripts/production-deploy.sh` - Production deployment

### Make Commands

```bash
make help              # Show all commands
make setup             # Initial project setup
make dev               # Start development
make build             # Build application
make test              # Run tests
make clean             # Clean build artifacts
make docker-build      # Build Docker image
make deploy-prod       # Deploy to production
```

## 🔧 Environment Configuration

### Environment Files

- `.env.example` - Template with all available variables
- `.env.local` - Local development (not committed)
- `.env.development` - Development environment
- `.env.staging` - Staging environment
- `.env.production` - Production environment

### Key Variables

```bash
# Application
REACT_APP_NAME=ConvoChat
REACT_APP_VERSION=1.0.0
NODE_ENV=production

# API Configuration
REACT_APP_API_URL=https://api.convochat.com
REACT_APP_WS_URL=wss://ws.convochat.com

# Feature Flags
REACT_APP_ENABLE_ANALYTICS=true
REACT_APP_ENABLE_PWA=true
```

## 📊 Monitoring

### Health Checks

```bash
# Check application health
curl http://localhost:3000/health

# Using the health check script
./scripts/health-check.sh

# Make command
make health-check
```

### Metrics & Logging

- **Prometheus metrics** available at `/metrics`
- **Application logs** via centralized logging
- **Performance monitoring** with built-in health monitoring
- **Error tracking** with Sentry integration

## 🔍 Troubleshooting

### Common Issues

#### Build Issues

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear build cache
npm run clean
```

#### Docker Issues

```bash
# Rebuild images
docker-compose build --no-cache

# Check container logs
docker-compose logs -f
```

#### Development Server Issues

```bash
# Check port availability
lsof -ti:3000

# Restart with different port
PORT=3001 npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Workflow

1. **Setup**: Run `./scripts/quickstart.sh --dev`
2. **Code**: Make your changes
3. **Test**: Ensure all tests pass
4. **Lint**: Run `npm run lint:fix`
5. **Format**: Code is auto-formatted on commit
6. **PR**: Open pull request with description

## 🚀 Ready to get started?

```bash
# Quick start - get up and running in 2 minutes!
./scripts/quickstart.sh --dev

# Or explore all available commands
make help
```

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

Happy coding! 🎉
