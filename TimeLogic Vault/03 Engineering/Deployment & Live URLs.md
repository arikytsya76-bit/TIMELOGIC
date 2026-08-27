---
title: Deployment & Live URLs
tags: [engineering, deployment, ops]
---

# Deployment & Live URLs

## 🌍 Live endpoints
| Component | Host | URL |
|---|---|---|
| Backend API | Render | https://timelogic.onrender.com/api |
| Super-Admin web | Cloudflare Pages (`timelogic`) | https://timelogic.pages.dev |
| Marketing site | Cloudflare Pages (`timelogic-web`) | https://timelogic-web.pages.dev |
| iOS/Web PWA | Cloudflare Pages (`timelogic-app`) | https://timelogic-app.pages.dev |
| Android APK | Expo EAS | [download](https://expo.dev/artifacts/eas/fNLP6bF4yXMh5sskgeUMHX.apk) |
| Desktop installers | GitHub Releases | [.exe](https://github.com/akenuw/timelogic-downloads/releases/download/v1.0.0/TimeLogic-Admin-Setup-1.0.0.exe) · [.deb](https://github.com/akenuw/timelogic-downloads/releases/download/v1.0.0/TimeLogic-Admin-1.0.0.deb) |

## ⚙️ How each ships
- **Backend** → Render runs `npx prisma migrate deploy && node src/server.js` against the production database.
- **Web / PWA / Marketing** → build → `wrangler pages deploy` to the matching Cloudflare project.
- **Desktop** → Electron build (Docker/Wine) → `.exe` + `.deb` → uploaded to the GitHub release; the marketing site links straight to them.
- **Android** → Expo EAS build → APK artifact.

## 🗂️ Repository layout (one monorepo)
```
backend/   → Node + Express + Prisma API
web/       → Super-Admin console (React + Vite)
pwa/       → iOS/Web employee app (Vite + PWA)
mobile/    → Android employee app (Expo)
desktop/   → Admin app (Electron)
website/   → Marketing site (Next.js)
```

> [!warning] Before a public demo
> Rotate the Super-Admin demo password (`superadmin@acme.com`). Treat all deploy tokens as secrets.

Related: [[Platforms & Download Links]] · [[Architecture]] · [[Tech Stack]]
