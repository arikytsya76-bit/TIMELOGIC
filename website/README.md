# TimeLogic — Marketing Website

A production-ready, single-page marketing site for TimeLogic, the secure workforce
attendance platform. Built to sit alongside Stripe / Linear / Rippling class SaaS.

## Stack
- **Next.js 16** (App Router, React 19, TypeScript)
- **Tailwind CSS v4** (CSS-first `@theme` tokens)
- **Motion** (`motion/react`) for all animation
- **Geist** font (self-hosted) + **lucide-react** icons

## Run
```bash
npm ci
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the static export in out/
```

## Design strategy
- **Direction:** dark, navy, security-first enterprise SaaS. Trust is the product,
  so the UI reads as control-room calm: deep navy base, one electric-blue accent,
  glass surfaces, restrained glow, generous space.
- **One locked accent** (`#2563eb` with a `#60a5fa` light tint). No second hue.
- **Hierarchy:** the hero leads with the promise; Features make the security spine
  (Wi-Fi + Device + Time) visually dominant via a dedicated "3 layers" block before
  the supporting bento; Platforms separate Available from Coming-soon; Achievements
  prove it with animated counters.
- **Motion language:** one easing (`[0.16,1,0.3,1]`) and one spring, used everywhere.
  Scroll-reveal (fade + rise, once), floating + cursor-tilt hero device, cursor
  spotlight on cards, animated nav underline, count-up stats, form state transitions,
  and a clock-ring sweep that bookends the page (loader + footer).
- **Accessibility:** full `prefers-reduced-motion` support (loops/parallax/sweeps
  collapse to instant), skip link, semantic landmarks, labelled inputs, visible focus
  rings, keyboard-dismissable menus.
- **SEO:** complete metadata (title template, description, OpenGraph, Twitter, robots),
  semantic headings, `metadataBase`.

## Architecture
```
app/
  layout.tsx     # fonts, SEO metadata, skip link
  page.tsx       # composes the sections (server component)
  globals.css    # Tailwind v4 tokens, glass/glow helpers, reduced-motion
components/
  IntroLoader · Header · Hero · Features · Platforms · Achievements · Contact · Footer
  ui/ Logo · DownloadMenu · PhoneMockup · CountUp
lib/
  site.ts        # ALL content + download links (edit here)
  motion.ts      # shared variants, easing, spring, in-view config
```

## Go-live checklist (3 edits)
Open `lib/site.ts` and set the download URLs after hosting and verifying the
installers (for example, on R2 / S3 / GitHub Releases):
- `DOWNLOADS.android.href` -> freshly built and verified Android APK
- `DOWNLOADS.windows.href` -> hosted `TimeLogic-Admin-Setup-1.0.0.exe`
- `DOWNLOADS.linux.href`   -> hosted `TimeLogic-Admin-1.0.0-amd64.deb`

Set each corresponding `available` value to `true` only after verification.
Previous Android and desktop artifacts predate the current clean builds and are
intentionally disabled. iOS and macOS remain "Coming soon".

## Deploy
Static-friendly: deploy on Cloudflare Pages / Vercel. Build command `npm run build`,
output handled by Next. The contact form is wired with loading/success/error states
and a clearly marked stub submit, ready to point at your email service or an API route.
