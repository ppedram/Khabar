# Khabar - Crime & Safety Reporting App

## Development Plan & Architecture Document

---

## 1. Executive Summary

Khabar is a real-time crime and safety reporting platform that enables users to report, view, and receive alerts about incidents in their vicinity. Similar to Citizen, it combines crowdsourced incident reporting with geolocation technology to keep communities informed and safe.

---

## 2. Technology Stack

### Backend (Primary)
| Component | Technology | Version | Justification |
|-----------|------------|---------|---------------|
| Runtime | Node.js | 20 LTS | Excellent async I/O, large ecosystem, real-time friendly |
| Framework | Fastify | 4.x | 2-3x faster than Express, built-in validation, TypeScript support |
| Language | TypeScript | 5.x | Type safety, better maintainability, IDE support |
| ORM | Prisma | 5.x | Type-safe queries, migrations, PostGIS support via extensions |
| Validation | Zod | 3.x | Runtime validation matching TypeScript types |

### Database & Storage
| Component | Technology | Version | Justification |
|-----------|------------|---------|---------------|
| Primary DB | PostgreSQL | 16.x | Robust, ACID compliant, excellent for geospatial |
| Geospatial | PostGIS | 3.4.x | Industry standard for geospatial queries |
| Cache | Redis | 7.x | In-memory caching, pub/sub for real-time, session store |
| Object Storage | MinIO/S3 | - | S3-compatible, self-hosted option for budget |
| Search | PostgreSQL FTS | - | Full-text search built-in, sufficient for MVP |

### Real-time & Messaging
| Component | Technology | Justification |
|-----------|------------|---------------|
| WebSockets | Socket.io | 4.x | Fallback support, rooms, namespaces |
| Job Queue | BullMQ | 5.x | Redis-based, reliable, scheduled jobs |
| Push Notifications | Firebase FCM | Free tier sufficient, cross-platform |

### Authentication & Security
| Component | Technology | Justification |
|-----------|------------|---------------|
| Auth | JWT + Refresh Tokens | Stateless, scalable |
| Phone Verification | Twilio Verify | Reliable, affordable |
| Rate Limiting | @fastify/rate-limit | Built-in, Redis-backed |
| Encryption | bcrypt + crypto | Industry standard |

### DevOps & Infrastructure
| Component | Technology | Justification |
|-----------|------------|---------------|
| Containerization | Docker | Consistent environments |
| Orchestration | Docker Compose (dev) | Simple local development |
| CI/CD | GitHub Actions | Free for public repos, integrated |
| Monitoring | Pino + Prometheus | Structured logging, metrics |
| API Docs | Swagger/OpenAPI | Auto-generated from schemas |

---

## 3. Database Schema

### Entity Relationship Diagram (Conceptual)

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Users     │────<│ Incident_Reports│>────│  Categories  │
└─────────────┘     └─────────────────┘     └──────────────┘
       │                    │
       │                    │
       ▼                    ▼
┌─────────────┐     ┌─────────────────┐
│  Sessions   │     │    Comments     │
└─────────────┘     └─────────────────┘
       │                    │
       │                    │
       ▼                    ▼
┌─────────────┐     ┌─────────────────┐
│   Devices   │     │     Media       │
└─────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │  Notifications  │
                    └─────────────────┘
```

### Tables Detail

#### users
```sql
- id: UUID PRIMARY KEY
- phone_number: VARCHAR(20) UNIQUE NOT NULL
- phone_verified: BOOLEAN DEFAULT FALSE
- email: VARCHAR(255) UNIQUE
- username: VARCHAR(50) UNIQUE
- display_name: VARCHAR(100)
- avatar_url: TEXT
- password_hash: VARCHAR(255)
- role: ENUM('user', 'moderator', 'admin') DEFAULT 'user'
- reputation_score: INTEGER DEFAULT 0
- reports_count: INTEGER DEFAULT 0
- verified_reports_count: INTEGER DEFAULT 0
- is_banned: BOOLEAN DEFAULT FALSE
- ban_reason: TEXT
- last_active_at: TIMESTAMP
- created_at: TIMESTAMP DEFAULT NOW()
- updated_at: TIMESTAMP DEFAULT NOW()
```

#### user_devices
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- device_token: TEXT NOT NULL (FCM token)
- device_type: ENUM('ios', 'android', 'web')
- device_name: VARCHAR(100)
- is_active: BOOLEAN DEFAULT TRUE
- last_used_at: TIMESTAMP
- created_at: TIMESTAMP DEFAULT NOW()
```

#### user_settings
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id) UNIQUE
- notification_radius_km: DECIMAL(5,2) DEFAULT 5.0
- notifications_enabled: BOOLEAN DEFAULT TRUE
- notify_categories: JSONB DEFAULT '[]' (category IDs)
- quiet_hours_start: TIME
- quiet_hours_end: TIME
- home_location: GEOGRAPHY(POINT, 4326)
- created_at: TIMESTAMP DEFAULT NOW()
- updated_at: TIMESTAMP DEFAULT NOW()
```

#### categories
```sql
- id: UUID PRIMARY KEY
- name: VARCHAR(50) UNIQUE NOT NULL
- slug: VARCHAR(50) UNIQUE NOT NULL
- description: TEXT
- icon: VARCHAR(50)
- color: VARCHAR(7) (hex color)
- severity_level: INTEGER DEFAULT 1 (1-5)
- is_active: BOOLEAN DEFAULT TRUE
- created_at: TIMESTAMP DEFAULT NOW()
```

#### incidents
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- category_id: UUID REFERENCES categories(id)
- title: VARCHAR(200) NOT NULL
- description: TEXT
- location: GEOGRAPHY(POINT, 4326) NOT NULL
- address: TEXT
- city: VARCHAR(100)
- neighborhood: VARCHAR(100)
- status: ENUM('pending', 'verified', 'resolved', 'rejected', 'expired') DEFAULT 'pending'
- severity: ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium'
- is_anonymous: BOOLEAN DEFAULT FALSE
- views_count: INTEGER DEFAULT 0
- upvotes_count: INTEGER DEFAULT 0
- comments_count: INTEGER DEFAULT 0
- expires_at: TIMESTAMP
- verified_at: TIMESTAMP
- verified_by: UUID REFERENCES users(id)
- resolved_at: TIMESTAMP
- created_at: TIMESTAMP DEFAULT NOW()
- updated_at: TIMESTAMP DEFAULT NOW()

INDEXES:
- GIST index on location for geospatial queries
- B-tree on status, created_at, category_id
- Composite on (status, created_at) for active incident queries
```

#### incident_media
```sql
- id: UUID PRIMARY KEY
- incident_id: UUID REFERENCES incidents(id) ON DELETE CASCADE
- user_id: UUID REFERENCES users(id)
- media_type: ENUM('image', 'video', 'audio')
- url: TEXT NOT NULL
- thumbnail_url: TEXT
- file_size: INTEGER
- duration_seconds: INTEGER (for video/audio)
- is_primary: BOOLEAN DEFAULT FALSE
- moderation_status: ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'
- created_at: TIMESTAMP DEFAULT NOW()
```

#### incident_updates
```sql
- id: UUID PRIMARY KEY
- incident_id: UUID REFERENCES incidents(id) ON DELETE CASCADE
- user_id: UUID REFERENCES users(id)
- update_type: ENUM('status_change', 'info_update', 'resolution')
- content: TEXT NOT NULL
- created_at: TIMESTAMP DEFAULT NOW()
```

#### comments
```sql
- id: UUID PRIMARY KEY
- incident_id: UUID REFERENCES incidents(id) ON DELETE CASCADE
- user_id: UUID REFERENCES users(id)
- parent_id: UUID REFERENCES comments(id) (for replies)
- content: TEXT NOT NULL
- is_edited: BOOLEAN DEFAULT FALSE
- is_deleted: BOOLEAN DEFAULT FALSE
- upvotes_count: INTEGER DEFAULT 0
- moderation_status: ENUM('pending', 'approved', 'rejected') DEFAULT 'approved'
- created_at: TIMESTAMP DEFAULT NOW()
- updated_at: TIMESTAMP DEFAULT NOW()
```

#### votes
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- incident_id: UUID REFERENCES incidents(id) ON DELETE CASCADE
- comment_id: UUID REFERENCES comments(id) ON DELETE CASCADE
- vote_type: ENUM('upvote', 'downvote', 'verify')
- created_at: TIMESTAMP DEFAULT NOW()

CONSTRAINT: user can vote once per incident/comment
UNIQUE(user_id, incident_id) WHERE incident_id IS NOT NULL
UNIQUE(user_id, comment_id) WHERE comment_id IS NOT NULL
```

#### notifications
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- incident_id: UUID REFERENCES incidents(id)
- type: ENUM('nearby_incident', 'comment', 'update', 'verification', 'system')
- title: VARCHAR(200) NOT NULL
- body: TEXT
- data: JSONB
- is_read: BOOLEAN DEFAULT FALSE
- sent_at: TIMESTAMP
- created_at: TIMESTAMP DEFAULT NOW()
```

#### moderation_queue
```sql
- id: UUID PRIMARY KEY
- content_type: ENUM('incident', 'comment', 'media', 'user')
- content_id: UUID NOT NULL
- reason: ENUM('new_content', 'reported', 'auto_flagged', 'ai_flagged')
- priority: INTEGER DEFAULT 1
- reported_by: UUID REFERENCES users(id)
- report_reason: TEXT
- assigned_to: UUID REFERENCES users(id)
- status: ENUM('pending', 'in_review', 'approved', 'rejected') DEFAULT 'pending'
- decision_notes: TEXT
- decided_by: UUID REFERENCES users(id)
- decided_at: TIMESTAMP
- created_at: TIMESTAMP DEFAULT NOW()
```

#### user_reports (for reporting other users)
```sql
- id: UUID PRIMARY KEY
- reporter_id: UUID REFERENCES users(id)
- reported_user_id: UUID REFERENCES users(id)
- reason: ENUM('spam', 'harassment', 'false_info', 'inappropriate', 'other')
- description: TEXT
- status: ENUM('pending', 'reviewed', 'action_taken', 'dismissed') DEFAULT 'pending'
- created_at: TIMESTAMP DEFAULT NOW()
```

#### audit_logs
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id)
- action: VARCHAR(100) NOT NULL
- entity_type: VARCHAR(50)
- entity_id: UUID
- old_values: JSONB
- new_values: JSONB
- ip_address: INET
- user_agent: TEXT
- created_at: TIMESTAMP DEFAULT NOW()
```

#### refresh_tokens
```sql
- id: UUID PRIMARY KEY
- user_id: UUID REFERENCES users(id) ON DELETE CASCADE
- token_hash: VARCHAR(255) NOT NULL
- device_id: UUID REFERENCES user_devices(id)
- expires_at: TIMESTAMP NOT NULL
- revoked_at: TIMESTAMP
- created_at: TIMESTAMP DEFAULT NOW()
```

---

## 4. API Architecture

### Base URL Structure
```
Production: https://api.khabar.app/v1
Staging: https://api-staging.khabar.app/v1
Development: http://localhost:3000/v1
```

### Authentication Endpoints
```
POST   /auth/request-otp        - Request phone verification OTP
POST   /auth/verify-otp         - Verify OTP and get tokens
POST   /auth/refresh            - Refresh access token
POST   /auth/logout             - Revoke refresh token
DELETE /auth/logout-all         - Revoke all user sessions
```

### User Endpoints
```
GET    /users/me                - Get current user profile
PATCH  /users/me                - Update current user profile
PUT    /users/me/avatar         - Upload/update avatar
GET    /users/me/settings       - Get user settings
PATCH  /users/me/settings       - Update user settings
GET    /users/me/incidents      - Get user's reported incidents
GET    /users/me/notifications  - Get user notifications
PATCH  /users/me/notifications/:id - Mark notification as read
POST   /users/me/devices        - Register device for push notifications
DELETE /users/me/devices/:id    - Unregister device
GET    /users/:id               - Get public user profile
POST   /users/:id/report        - Report a user
```

### Incident Endpoints
```
GET    /incidents               - List incidents (with filters)
POST   /incidents               - Create new incident
GET    /incidents/nearby        - Get incidents near location (geospatial)
GET    /incidents/map           - Get incidents for map view (clustered)
GET    /incidents/:id           - Get incident details
PATCH  /incidents/:id           - Update incident (owner only)
DELETE /incidents/:id           - Delete incident (owner/admin)
POST   /incidents/:id/verify    - Verify incident (confirm it's real)
POST   /incidents/:id/upvote    - Upvote incident
DELETE /incidents/:id/upvote    - Remove upvote
POST   /incidents/:id/media     - Add media to incident
GET    /incidents/:id/updates   - Get incident updates
POST   /incidents/:id/updates   - Add update to incident
```

### Comments Endpoints
```
GET    /incidents/:id/comments  - Get comments for incident
POST   /incidents/:id/comments  - Add comment to incident
PATCH  /comments/:id            - Update comment
DELETE /comments/:id            - Delete comment
POST   /comments/:id/upvote     - Upvote comment
DELETE /comments/:id/upvote     - Remove upvote
POST   /comments/:id/report     - Report comment
```

### Categories Endpoints
```
GET    /categories              - List all categories
GET    /categories/:slug        - Get category details
```

### Search Endpoints
```
GET    /search                  - Search incidents and users
GET    /search/autocomplete     - Autocomplete for search
```

### Admin/Moderation Endpoints
```
GET    /admin/moderation-queue          - Get moderation queue
PATCH  /admin/moderation-queue/:id      - Process moderation item
GET    /admin/incidents                 - List all incidents (admin view)
PATCH  /admin/incidents/:id/status      - Change incident status
GET    /admin/users                     - List all users
PATCH  /admin/users/:id                 - Update user (ban, role, etc.)
GET    /admin/stats                     - Get platform statistics
GET    /admin/reports                   - Get user reports
PATCH  /admin/reports/:id               - Process user report
```

### WebSocket Events
```
Client -> Server:
- join_area(bounds)             - Subscribe to incidents in geographic area
- leave_area()                  - Unsubscribe from area
- join_incident(id)             - Subscribe to incident updates
- leave_incident(id)            - Unsubscribe from incident

Server -> Client:
- new_incident                  - New incident in subscribed area
- incident_updated              - Incident was updated
- incident_resolved             - Incident was resolved
- new_comment                   - New comment on subscribed incident
- notification                  - Push notification data
```

---

## 5. Project Structure

```
khabar/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.ts           # Environment config
│   │   │   ├── database.ts        # Database configuration
│   │   │   ├── redis.ts           # Redis configuration
│   │   │   └── swagger.ts         # API documentation config
│   │   │
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── auth.schema.ts
│   │   │   │   └── auth.types.ts
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── users.controller.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── users.routes.ts
│   │   │   │   ├── users.schema.ts
│   │   │   │   └── users.types.ts
│   │   │   │
│   │   │   ├── incidents/
│   │   │   │   ├── incidents.controller.ts
│   │   │   │   ├── incidents.service.ts
│   │   │   │   ├── incidents.routes.ts
│   │   │   │   ├── incidents.schema.ts
│   │   │   │   └── incidents.types.ts
│   │   │   │
│   │   │   ├── comments/
│   │   │   │   ├── comments.controller.ts
│   │   │   │   ├── comments.service.ts
│   │   │   │   ├── comments.routes.ts
│   │   │   │   └── comments.schema.ts
│   │   │   │
│   │   │   ├── notifications/
│   │   │   │   ├── notifications.controller.ts
│   │   │   │   ├── notifications.service.ts
│   │   │   │   ├── notifications.routes.ts
│   │   │   │   └── push.service.ts
│   │   │   │
│   │   │   ├── media/
│   │   │   │   ├── media.controller.ts
│   │   │   │   ├── media.service.ts
│   │   │   │   ├── media.routes.ts
│   │   │   │   └── storage.service.ts
│   │   │   │
│   │   │   ├── admin/
│   │   │   │   ├── admin.controller.ts
│   │   │   │   ├── admin.service.ts
│   │   │   │   ├── admin.routes.ts
│   │   │   │   └── moderation.service.ts
│   │   │   │
│   │   │   └── search/
│   │   │       ├── search.controller.ts
│   │   │       ├── search.service.ts
│   │   │       └── search.routes.ts
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── admin.middleware.ts
│   │   │   ├── rate-limit.middleware.ts
│   │   │   ├── validation.middleware.ts
│   │   │   └── error-handler.middleware.ts
│   │   │
│   │   ├── websocket/
│   │   │   ├── socket.ts          # Socket.io setup
│   │   │   ├── handlers/
│   │   │   │   ├── area.handler.ts
│   │   │   │   └── incident.handler.ts
│   │   │   └── events.ts          # Event type definitions
│   │   │
│   │   ├── jobs/
│   │   │   ├── queue.ts           # BullMQ setup
│   │   │   ├── workers/
│   │   │   │   ├── notification.worker.ts
│   │   │   │   ├── media-processing.worker.ts
│   │   │   │   └── cleanup.worker.ts
│   │   │   └── schedulers/
│   │   │       └── incident-expiry.scheduler.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── geo.ts             # Geospatial utilities
│   │   │   ├── pagination.ts
│   │   │   ├── crypto.ts
│   │   │   └── errors.ts          # Custom error classes
│   │   │
│   │   ├── types/
│   │   │   ├── fastify.d.ts       # Fastify type extensions
│   │   │   └── global.d.ts
│   │   │
│   │   ├── app.ts                 # Fastify app setup
│   │   └── server.ts              # Entry point
│   │
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema
│   │   ├── migrations/            # Database migrations
│   │   └── seed.ts                # Seed data
│   │
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   │
│   ├── docker/
│   │   ├── Dockerfile
│   │   └── docker-compose.yml
│   │
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── docs/
│   ├── api/                       # API documentation
│   └── architecture/              # Architecture diagrams
│
├── scripts/
│   ├── setup.sh                   # Development setup
│   └── deploy.sh                  # Deployment scripts
│
├── .github/
│   └── workflows/
│       ├── ci.yml                 # CI pipeline
│       └── deploy.yml             # CD pipeline
│
├── DEVELOPMENT_PLAN.md            # This document
└── README.md                      # Project overview
```

---

## 6. Development Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Basic project setup and core infrastructure

- [x] Project structure setup
- [ ] Docker Compose for local development (PostgreSQL, Redis, MinIO)
- [ ] Prisma schema and initial migration
- [ ] Fastify app with basic middleware
- [ ] Logging and error handling
- [ ] Environment configuration
- [ ] Basic health check endpoint

**Deliverables**:
- Running local development environment
- Database with schema applied
- API responding to health checks

### Phase 2: Authentication (Week 2-3)
**Goal**: Complete user authentication flow

- [ ] Phone number OTP request/verify (Twilio integration)
- [ ] JWT access token generation
- [ ] Refresh token rotation
- [ ] Auth middleware for protected routes
- [ ] User profile CRUD
- [ ] Device registration for push notifications
- [ ] Rate limiting on auth endpoints

**Deliverables**:
- Users can register/login via phone
- Protected routes working
- Device tokens stored for push

### Phase 3: Core Incidents (Week 3-4)
**Goal**: Incident reporting and viewing

- [ ] Categories seeding
- [ ] Create incident endpoint
- [ ] Geospatial queries (nearby incidents)
- [ ] List/filter incidents
- [ ] Incident detail view
- [ ] Incident updates
- [ ] Upvoting/verification
- [ ] Basic search

**Deliverables**:
- Users can report incidents with location
- Users can view nearby incidents
- Incidents can be updated and verified

### Phase 4: Real-time & Comments (Week 4-5)
**Goal**: Live updates and engagement

- [ ] Socket.io integration
- [ ] Area subscription for new incidents
- [ ] Incident subscription for updates
- [ ] Comments CRUD
- [ ] Real-time comment updates
- [ ] Notification creation (in-app)

**Deliverables**:
- Live incident updates on map
- Real-time comments
- In-app notification storage

### Phase 5: Media & Notifications (Week 5-6)
**Goal**: Rich media and push notifications

- [ ] S3/MinIO upload integration
- [ ] Image upload and processing
- [ ] Video upload with size limits
- [ ] Thumbnail generation
- [ ] Firebase FCM integration
- [ ] Push notification for nearby incidents
- [ ] Notification preferences
- [ ] BullMQ job processing

**Deliverables**:
- Users can attach photos/videos
- Push notifications working
- Customizable notification radius

### Phase 6: Moderation & Admin (Week 6-7)
**Goal**: Content moderation tools

- [ ] Moderation queue
- [ ] Admin incident management
- [ ] User management (ban/unban)
- [ ] Report handling
- [ ] User reputation scoring
- [ ] Audit logging
- [ ] Admin statistics dashboard API

**Deliverables**:
- Admins can moderate content
- Users can report issues
- Reputation system active

### Phase 7: Polish & Security (Week 7-8)
**Goal**: Production readiness

- [ ] Comprehensive input validation
- [ ] SQL injection prevention audit
- [ ] Rate limiting fine-tuning
- [ ] Error message sanitization
- [ ] API documentation completion
- [ ] Performance optimization
- [ ] Load testing
- [ ] Security audit

**Deliverables**:
- Production-ready API
- Complete documentation
- Security best practices implemented

### Phase 8: Deployment & Testing (Week 8-9)
**Goal**: Launch preparation

- [ ] CI/CD pipeline
- [ ] Docker production build
- [ ] Database backup strategy
- [ ] Monitoring setup
- [ ] Integration tests
- [ ] E2E tests for critical flows
- [ ] Staging environment
- [ ] Production deployment

**Deliverables**:
- Deployed to staging
- All tests passing
- Ready for production launch

---

## 7. Key Dependencies

### Core
```json
{
  "fastify": "^4.25.0",           // Web framework
  "typescript": "^5.3.0",         // Type safety
  "@fastify/cors": "^8.5.0",      // CORS support
  "@fastify/helmet": "^11.1.0",   // Security headers
  "@fastify/jwt": "^8.0.0",       // JWT support
  "@fastify/rate-limit": "^9.1.0",// Rate limiting
  "@fastify/swagger": "^8.12.0",  // API documentation
  "@fastify/multipart": "^8.1.0"  // File uploads
}
```

### Database & ORM
```json
{
  "prisma": "^5.8.0",             // ORM
  "@prisma/client": "^5.8.0",     // Database client
  "ioredis": "^5.3.0"             // Redis client
}
```

### Real-time & Jobs
```json
{
  "socket.io": "^4.7.0",          // WebSocket
  "bullmq": "^5.1.0"              // Job queue
}
```

### Validation & Security
```json
{
  "zod": "^3.22.0",               // Schema validation
  "bcrypt": "^5.1.0",             // Password hashing
  "nanoid": "^5.0.0"              // ID generation
}
```

### External Services
```json
{
  "twilio": "^4.21.0",            // SMS/Phone verification
  "@aws-sdk/client-s3": "^3.490.0", // S3/MinIO
  "firebase-admin": "^12.0.0"      // Push notifications
}
```

### Utilities
```json
{
  "pino": "^8.17.0",              // Logging
  "pino-pretty": "^10.3.0",       // Dev logging
  "dotenv": "^16.3.0",            // Environment variables
  "date-fns": "^3.1.0"            // Date utilities
}
```

### Development
```json
{
  "vitest": "^1.1.0",             // Testing
  "supertest": "^6.3.0",          // HTTP testing
  "tsx": "^4.7.0",                // TypeScript execution
  "eslint": "^8.56.0",            // Linting
  "prettier": "^3.2.0"            // Formatting
}
```

---

## 8. Testing Strategy

### Unit Tests
- Service layer logic
- Utility functions
- Validation schemas
- Geospatial calculations

### Integration Tests
- API endpoint behavior
- Database operations
- Authentication flows
- File uploads

### E2E Tests (Critical Paths)
1. User registration/login flow
2. Incident creation and viewing
3. Nearby incidents query
4. Comment flow
5. Push notification delivery

### Test Coverage Goals
- Minimum 80% code coverage
- 100% coverage on authentication
- 100% coverage on payment/critical paths

---

## 9. Security Considerations

### Authentication
- Short-lived access tokens (15 min)
- Refresh token rotation
- Device binding for tokens
- OTP rate limiting (5 attempts per hour)
- Account lockout after failed attempts

### Data Protection
- HTTPS everywhere
- Password hashing with bcrypt (rounds: 12)
- Sensitive data encryption at rest
- PII anonymization in logs
- GDPR-compliant data deletion

### API Security
- Rate limiting (tiered by endpoint)
- Input validation on all endpoints
- SQL injection prevention (Prisma)
- XSS prevention (content sanitization)
- CORS configuration
- Helmet security headers

### Content Security
- File type validation
- File size limits
- Malware scanning (ClamAV)
- Image metadata stripping
- Moderation queue for all content

### Infrastructure
- Network isolation
- Secrets management (environment variables)
- Database connection encryption
- Regular security updates
- Audit logging

---

## 10. Deployment Strategy

### Environments
1. **Development**: Local Docker Compose
2. **Staging**: Single server (Docker)
3. **Production**: Container orchestration

### Recommended Production Stack (Budget-Conscious)
- **Hosting**: DigitalOcean Droplet or Railway
- **Database**: Managed PostgreSQL (Supabase free tier or DO managed)
- **Redis**: Upstash (free tier) or self-hosted
- **Storage**: Cloudflare R2 (S3-compatible, free egress)
- **CDN**: Cloudflare (free tier)

### CI/CD Pipeline
```yaml
# On Push to main:
1. Run linter
2. Run tests
3. Build Docker image
4. Push to registry
5. Deploy to staging

# On Release tag:
1. All above +
2. Deploy to production
3. Run smoke tests
4. Notify team
```

### Scaling Strategy (Future)
- Horizontal API scaling with load balancer
- Read replicas for database
- Redis cluster for cache/pubsub
- CDN for static assets
- Queue workers as separate service

---

## 11. Potential Challenges & Mitigations

| Challenge | Risk | Mitigation |
|-----------|------|------------|
| Geospatial query performance | High | PostGIS indexes, query optimization, caching hot areas |
| Real-time at scale | Medium | Socket.io with Redis adapter, horizontal scaling |
| Media storage costs | Medium | Cloudflare R2, aggressive image compression, retention policies |
| False reports/spam | High | User reputation, moderation queue, ML content filtering (future) |
| Push notification delivery | Medium | Firebase for reliability, fallback to email |
| Phone verification costs | Medium | Twilio Verify pricing, limit OTP requests |
| Location accuracy | Low | Client-side GPS handling, manual location adjustment |
| Content moderation backlog | Medium | Auto-flag suspicious content, volunteer moderators |

---

## 12. Questions to Consider

Before implementation, please confirm:

1. **Geographic Focus**: Single city/country or global? (affects localization, timezone handling)

2. **Verification Model**:
   - Community verified (X users confirm)?
   - Official sources integration (police, fire)?
   - AI-assisted verification?

3. **Anonymous Posting**:
   - Fully anonymous allowed?
   - Anonymous to public but tracked internally?
   - Phone verification required for all?

4. **Media Requirements**:
   - Max file sizes? (suggest: 10MB images, 100MB videos)
   - Video length limits? (suggest: 60 seconds)
   - Live streaming needed? (adds complexity)

5. **Notification Scope**:
   - Single radius per user?
   - Multiple saved locations (home, work)?
   - Category-specific radius?

6. **Revenue Model** (affects architecture):
   - Free with ads?
   - Freemium features?
   - B2B API access?

7. **Compliance Requirements**:
   - GDPR (EU users)?
   - CCPA (California)?
   - Local regulations?

8. **Integration Priorities**:
   - Emergency services integration?
   - Social media sharing?
   - Third-party data sources?

---

## 13. MVP Feature Scope

For the 2-3 month timeline, I recommend this MVP scope:

### Must Have (MVP)
- Phone authentication
- Incident CRUD with geolocation
- Nearby incidents API
- Map data endpoint
- Photo upload (no video initially)
- Real-time new incident notifications
- Push notifications for nearby
- Basic moderation (admin approve/reject)
- Categories (hardcoded initial set)

### Should Have (Post-MVP v1.1)
- Video upload
- Comments
- User profiles/reputation
- Search
- Incident updates/timeline
- Email notifications

### Nice to Have (v1.2+)
- Incident verification voting
- Advanced reputation algorithm
- ML content moderation
- Live streaming
- Official source integration
- Analytics dashboard

---

This plan provides a solid foundation. Shall I proceed with implementation starting with the project setup and authentication system?
