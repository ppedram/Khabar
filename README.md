# Khabar - Crime & Safety Reporting Platform

Real-time incident reporting and community safety application, similar to Citizen. Users can report and view incidents on a map, receive push notifications for nearby events, and engage with their community.

## Features

- **Real-time Incident Reporting** - Report incidents with geolocation, photos, and videos
- **Map Visualization** - View incidents on an interactive map
- **Push Notifications** - Get alerts for incidents near your location
- **Community Verification** - Crowdsourced incident verification
- **Content Moderation** - Admin tools for content management
- **User Reputation** - Credibility scoring based on report accuracy

## Tech Stack

### Backend
- Node.js + Fastify (TypeScript)
- PostgreSQL + PostGIS
- Redis (caching, pub/sub)
- Socket.io (real-time)
- BullMQ (job queue)
- S3/MinIO (media storage)

### Planned Mobile App
- React Native / Flutter
- Native maps integration
- Push notifications (FCM)

## Quick Start

```bash
# Clone repository
git clone <repo-url>
cd Khabar

# Start backend
cd backend
npm install
cp .env.example .env

# Start infrastructure (PostgreSQL, Redis, MinIO)
cd docker
docker-compose up -d

# Run migrations
npm run db:migrate
npm run db:seed

# Start server
npm run dev
```

API available at: http://localhost:3000
Documentation at: http://localhost:3000/docs

## Project Structure

```
Khabar/
├── backend/              # Fastify API server
│   ├── src/              # Source code
│   ├── prisma/           # Database schema
│   └── docker/           # Docker configuration
├── docs/                 # Documentation
└── DEVELOPMENT_PLAN.md   # Detailed development plan
```

## Documentation

- [Development Plan](./DEVELOPMENT_PLAN.md) - Comprehensive architecture and roadmap
- [API Documentation](http://localhost:3000/docs) - Swagger/OpenAPI docs (when running)
- [Backend README](./backend/README.md) - Backend-specific documentation

## Development

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16+ with PostGIS (or use Docker)
- Redis 7+ (or use Docker)

### Environment Setup
1. Copy `.env.example` to `.env`
2. Configure database, Redis, and service credentials
3. For phone verification, set up Twilio credentials
4. For push notifications, set up Firebase credentials

### Running Tests
```bash
cd backend
npm run test
```

## API Overview

### Core Endpoints
- `POST /v1/auth/request-otp` - Request phone verification
- `POST /v1/auth/verify-otp` - Verify and login
- `GET /v1/incidents/nearby` - Get incidents near location
- `POST /v1/incidents` - Report new incident
- `GET /v1/incidents/:id` - Get incident details

### WebSocket Events
- `join_area(bounds)` - Subscribe to geographic area
- `new_incident` - Receive new incident alerts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## Acknowledgments

Inspired by Citizen app for community safety reporting.
