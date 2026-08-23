# Attendance System — Backend API

Node.js + Express + Prisma backend for the Advanced Attendance System.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Primary DB | PostgreSQL |
| Cache / Token Store | Redis |
| Real-time | Socket.io |
| Auth | JWT (access + refresh) |
| QR | HMAC-SHA256 rotating tokens |

---

## Quick Start

### 1. Prerequisites

- Node.js ≥ 18
- PostgreSQL running locally (or via Docker)
- Redis running locally (or via Docker)

```bash
# Docker one-liner (optional)
docker run -d --name timelogic-postgres -e POSTGRES_USER=timelogic -e POSTGRES_PASSWORD=timelogic -e POSTGRES_DB=timelogic -p 5432:5432 postgres:16
docker run -d --name redis -p 6379:6379 redis:7
```

### 2. Install

```bash
cd backend
npm ci
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env — fill in DATABASE_URL, JWT secrets, QR secret
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Database

```bash
npm run db:generate   # generate Prisma client
npm run db:migrate    # run migrations (creates tables)
npm run db:seed       # seed demo data
```

### 5. Run

```bash
npm run dev    # development (nodemon)
npm start      # production
```

Server starts at `http://localhost:5000`.

---

## API Overview

All endpoints return `{ success: boolean, data?: any, message?: string }`.

### Authentication  `POST /api/auth/...`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | — | Login, returns access + refresh token |
| POST | `/logout` | ✓ | Revoke refresh token |
| POST | `/refresh` | — | Get new access token |
| GET | `/me` | ✓ | Current user profile |
| PUT | `/change-password` | ✓ | Change password |

### Attendance  `POST /api/attendance/...`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/check-in/challenge` | Employee | Validate the active session/network and issue a one-time code |
| POST | `/check-in` | Employee | Submit the code with device and Wi-Fi context |
| POST | `/check-out` | Employee | Clock out |
| GET | `/status` | Employee | Today's attendance status |
| GET | `/history` | Employee | Historical records |
| GET | `/flagged` | Admin | Flagged records |
| PUT | `/records/:id/flag` | Admin | Flag a record |
| PUT | `/records/:id/approve` | Admin | Approve a flagged record |

### Admin station  `/api/admin/...`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/attendance/login-status` | Admin | Database-backed first/latest Admin login for the current work day |
| GET | `/manual-attendance` | Admin | Active sessions and employees allowed to use the manual station |
| POST | `/manual-attendance/check-in` | Admin + employee password | Server-time employee check-in with normal lateness/penalties |
| POST | `/manual-attendance/check-out` | Admin + employee password | Audited employee check-out |
| GET | `/students` | Admin | Student station list when enabled by Super Admin |
| POST | `/students` | Admin | Create a student |
| POST | `/students/:id/check-in` | Admin | Unrestricted-time student check-in |
| POST | `/students/:id/check-out` | Admin | Student check-out |

### Sessions  `/api/sessions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Admin | Create session |
| POST | `/:id/start` | Admin | Start → generates first QR |
| POST | `/:id/pause` | Admin | Pause |
| POST | `/:id/resume` | Admin | Resume |
| POST | `/:id/end` | Admin | End |
| POST | `/:id/lock` | Admin | Lock |
| POST | `/:id/refresh-qr` | Admin | Force QR rotation |
| GET | `/:id/status` | Admin | Live session stats |
| GET | `/:id/qr` | ✓ | Current QR as PNG image |

### Breaks  `/api/breaks`
### Leaves  `/api/leaves`
### Fraud   `/api/fraud`
### Reports `/api/reports`
### Admin   `/api/admin`

## Local feature verification

Start the API first, then run this in another terminal:

```bash
npm run verify:local
```

It checks organization capability gates, Admin login persistence, employee
PHONE/MANUAL authentication, server-owned attendance time, penalties, tenant
isolation, student check-in/out, capability disabling, and overnight work-day
handling. All created verification data is removed automatically.

---

## Real-time Events (Socket.io)

Connect with Bearer token in `auth.token`:

```js
const socket = io('http://localhost:5000', { auth: { token: '<accessToken>' } });
```

| Event | Direction | Payload |
|-------|-----------|---------|
| `attendance:checkin` | Server → Client | `{ record, sessionId }` |
| `attendance:checkout` | Server → Client | `{ record, sessionId }` |
| `qr:rotated` | Server → Client | `{ sessionId, tokenId, expiresAt, expiresIn }` |
| `session:started` | Server → Client | session object |
| `session:paused` | Server → Client | session object |
| `session:ended` | Server → Client | session object |
| `fraud:alerts` | Server → Admins | alerts array |
| `emergency:stop_all` | Server → All | `{ officeId }` |
| `notification:employee` | Server → Client | `{ userId, message }` |

Join a session room to receive QR rotations:
```js
socket.emit('session:join', sessionId);
```

---

## Check-in Flow

```
Mobile App
  ├─► POST /api/attendance/check-in/challenge
  │     body: { sessionId, wifiSSID, deviceId }
  └─► POST /api/attendance/check-in
        body: { sessionId, challengeCode, deviceId,
                wifiSSID, platform, model }

Server validates in order:
  1. Employee and organization permit PHONE attendance
  2. Session is ACTIVE and belongs to the employee's organization
  3. Server time is inside the session start/end interval
  4. One-time challenge is valid and unexpired
  5. Registered device and office network rules pass
  6. Server computes PRESENT/LATE and penalties from office opening rules
  7. AttendanceRecord is created with source PHONE
  8. Real-time update is emitted to the Admin dashboard
```

---

## Seed Accounts

After running `npm run db:seed`:

| Email | Password | Role |
|-------|----------|------|
| superadmin@acme.com | Admin@1234 | SUPER_ADMIN |

The seed intentionally creates only the platform Super Admin. Sign in to the
web panel and create an organization to generate its first Admin account; that
Admin can then create Employee accounts.

---

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma        ← All models + enums
│   └── seed.js
├── src/
│   ├── config/
│   │   ├── app.js           ← Express setup
│   │   ├── database.js      ← Prisma client
│   │   ├── env.js           ← Validated env vars
│   │   ├── logger.js        ← Winston
│   │   └── redis.js         ← IORedis
│   ├── controllers/         ← Thin HTTP handlers
│   ├── middleware/          ← auth, roleGuard, rateLimiter, validate, errorHandler
│   ├── routes/              ← Express routers
│   ├── services/            ← Business logic
│   │   ├── AuthenticationService.js
│   │   ├── AttendanceService.js  ← Facade
│   │   ├── BreakService.js
│   │   ├── EmergencyControlService.js
│   │   ├── FraudDetectionEngine.js  ← Observer
│   │   ├── LeaveService.js
│   │   ├── NotificationService.js
│   │   ├── QRTokenService.js     ← Factory
│   │   ├── ReportService.js
│   │   └── SessionService.js     ← State machine
│   ├── sockets/
│   │   ├── io.js            ← Socket.io init + rooms
│   │   └── qrRotation.js    ← QR rotation worker
│   └── server.js            ← Entry point
└── .env.example
```
