---
title: Architecture
tags: [engineering, architecture]
---

# Architecture

## Big picture
```mermaid
flowchart TB
  subgraph Clients
    AND[📱 Android<br/>Expo]
    PWA[🍏 iOS/Web PWA<br/>Vite React]
    DESK[🖥️ Desktop Admin<br/>Electron]
    WEB[🛡️ Super-Admin<br/>React]
    MKT[🌐 Marketing<br/>Next.js]
  end

  subgraph Backend [Backend API · Local port 5000]
    R[Routes] --> C[Controllers]
    C --> S[Services<br/>business logic]
    S --> P[(Prisma ORM)]
    MW[Middleware:<br/>auth · RBAC · rate-limit<br/>validate · upload · errors]
  end

  DB[(PostgreSQL)]
  RT((Real-time<br/>presence + alerts))

  AND & PWA & DESK & WEB -->|Local HTTP / JWT| R
  MKT -. download links .-> DESK & AND
  P --> DB
  S --- RT
```

## Layered backend (clean separation)
Each request flows through clear layers — **thin controllers, fat services**:

`Route → Middleware → Controller → Service → Prisma → PostgreSQL`

- **Routes** (`routes/*.js`) — URL → handler mapping only.
- **Middleware** (`middleware/*.js`) — cross-cutting: `auth` (JWT), `roleGuard` (RBAC), `rateLimiter`, `validate`, `upload`, `errorHandler`.
- **Controllers** (`controllers/*.js`) — parse request, call a service, shape response. No business logic.
- **Services** (`services/*.js`) — all the real logic, e.g. `AttendanceService`, `AuthenticationService`, `FraudDetectionEngine`, `SessionService`, `BreakService`, `LeaveService`, `ReportService`, `NotificationService`, `EmergencyControlService`, `QRTokenService`.
- **Prisma** — single typed data layer + migrations over PostgreSQL.

## Check-in sequence (the core flow)
```mermaid
sequenceDiagram
  participant E as Employee app
  participant API as Backend
  participant DB as PostgreSQL
  E->>API: get current session
  API-->>E: active session (or none)
  E->>API: request challenge (sessionId, device, platform, ip)
  API->>API: Layer 1 network check (SSID / public IP)
  API-->>E: one-time code
  E->>API: check-in (code, device, platform, ip)
  API->>API: Layer 2 device + Layer 3 time/code
  API->>DB: record attendance (PRESENT / LATE)
  API->>API: auto-learn office IP (if SSID-verified)
  API-->>E: ✅ status + any penalty
```

## Multi-tenancy
One backend serves all organizations. Isolation is enforced in the data layer — **every query is scoped by `orgId`** (Super Admin excepted). → [[How It's Clean]] · [[User Roles]]

Related: [[Tech Stack]] · [[Data Model]] · [[Deployment & Live URLs]]
