---
title: Tech Stack
tags: [engineering, stack]
---

# Tech Stack

## ☁️ Backend
- **Node.js + Express** — REST API
- **Prisma ORM + PostgreSQL** — typed data layer, migrations
- **JWT auth** + refresh tokens; **RBAC** role guards
- **Real-time** presence + fraud alerts (socket layer)
- Currently local-only on port `5000`; public backend hosting is deferred.

## 📱 Employee apps
- **Android:** React Native via **Expo** (EAS build → APK)
- **iOS / Web:** **PWA** — Vite + React + TypeScript + Tailwind, service worker (network-first, auto-update), installable

## 🖥️ Admin apps
- **Desktop:** **Electron** + React/Vite → packaged `.exe` (NSIS) and `.deb`
- **Super-Admin web:** React + Vite + TypeScript + Tailwind

## 🌐 Marketing
- **Next.js 15** (static export) + **Tailwind v4** + **Motion** (Framer Motion)

## 🎨 Cross-cutting
- **TypeScript** across web/PWA/desktop
- **Tailwind** + **CSS-variable design tokens** → one theme definition drives light/dark everywhere
- **lucide-react** icon set
- Shared **design language** so the PWA mirrors the Android app pixel-for-pixel

## 🚀 Infra & delivery
- **Cloudflare Pages** — marketing, super-admin, PWA (3 projects)
- **Docker Compose** — local PostgreSQL + Redis; backend hosting comes later
- **GitHub Releases** — desktop installer hosting
- **Expo EAS** — Android build/distribution
- Single **git** monorepo: `backend/ web/ pwa/ mobile/ desktop/ website/`

> [!note] Why this stack
> Local-first backend verification keeps development deterministic. Prisma = safe, typed DB access. One web tech family (React + TS + Tailwind) = shared knowledge across surfaces. → [[How It's Clean]]

Related: [[Architecture]] · [[Deployment & Live URLs]]
