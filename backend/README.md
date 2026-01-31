# Khabar Backend API

Real-time crime and safety reporting API built with Fastify, TypeScript, and PostgreSQL with PostGIS.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify 4.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 16 + PostGIS 3.4
- **ORM**: Prisma 5.x
- **Cache**: Redis 7.x
- **Real-time**: Socket.io 4.x
- **Job Queue**: BullMQ 5.x
- **Storage**: S3/MinIO

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm or yarn

### Development Setup

1. **Clone and install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Start infrastructure services**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`
API documentation at `http://localhost:3000/docs`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed database with initial data |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run typecheck` | Type check without emitting |

## API Endpoints

### Authentication
- `POST /v1/auth/request-otp` - Request phone verification OTP
- `POST /v1/auth/verify-otp` - Verify OTP and get tokens
- `POST /v1/auth/refresh` - Refresh access token
- `POST /v1/auth/logout` - Logout

### Users
- `GET /v1/users/me` - Get current user
- `PATCH /v1/users/me` - Update profile
- `GET /v1/users/me/settings` - Get settings
- `PATCH /v1/users/me/settings` - Update settings

### Incidents
- `GET /v1/incidents` - List incidents
- `POST /v1/incidents` - Create incident
- `GET /v1/incidents/nearby` - Get nearby incidents
- `GET /v1/incidents/map` - Get incidents for map view
- `GET /v1/incidents/:id` - Get incident details
- `POST /v1/incidents/:id/upvote` - Upvote incident
- `POST /v1/incidents/:id/verify` - Verify incident

### Categories
- `GET /v1/categories` - List all categories

### Admin
- `GET /v1/admin/moderation-queue` - Get moderation queue
- `GET /v1/admin/stats` - Get platform statistics

## WebSocket Events

Connect to `/socket.io` for real-time updates.

### Client → Server
- `join_area(bounds)` - Subscribe to geographic area
- `leave_area()` - Unsubscribe from area
- `join_incident(id)` - Subscribe to incident updates
- `leave_incident(id)` - Unsubscribe from incident

### Server → Client
- `new_incident` - New incident in subscribed area
- `incident_updated` - Incident was updated
- `notification` - Push notification

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for JWT signing
- `TWILIO_*` - Twilio credentials for SMS
- `S3_*` - S3/MinIO configuration

## Project Structure

```
src/
├── config/          # Configuration
├── modules/         # Feature modules
│   ├── auth/        # Authentication
│   ├── users/       # User management
│   ├── incidents/   # Incident reporting
│   ├── comments/    # Comments
│   ├── media/       # Media uploads
│   ├── notifications/ # Notifications
│   ├── admin/       # Admin functions
│   └── search/      # Search
├── middleware/      # Fastify middleware
├── websocket/       # Socket.io setup
├── jobs/            # BullMQ workers
├── utils/           # Utilities
├── types/           # TypeScript types
├── app.ts           # Fastify app setup
└── server.ts        # Entry point
```

## License

MIT
