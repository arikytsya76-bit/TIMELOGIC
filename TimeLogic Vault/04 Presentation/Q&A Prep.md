---
title: Q&A Prep
tags: [presentation, qa]
---

# Q&A Prep

> [!note] Answer format: short claim → one sentence of "how".

**Q: Can't someone just spoof the Wi-Fi / IP?**
Each layer is independent — even if one is faked, the **device binding** and **time-boxed code** still have to pass. The IP is also **auto-learned from real Wi-Fi-verified check-ins**, so it tracks the actual office. → [[The 3-Layer Verification]]

**Q: iPhones can't read the Wi-Fi name — so how do you verify them?**
We verify the **public IP** of the office network instead, and auto-maintain it. Android keeps using SSID. Same guarantee, two methods. → [[The 3-Layer Verification]]

**Q: What if an employee gets a new phone?**
An admin clicks **Reset device**; the next phone they sign in on becomes the bound one, and the old phone stops working. → [[Data Model]]

**Q: What stops sharing one phone for several people?**
**One device per account.** A phone already bound to someone else is rejected. → [[Anti-Cheat & Fraud]]

**Q: Does it work offline?**
The check-in itself needs the network (that's the verification). The app shell is a PWA and loads instantly, but **attendance is always live** — never cached/faked.

**Q: Is data ever lost or editable?**
No. **Soft deletes only**, full audit trail, permanent sessions, Excel/CSV export. → [[Anti-Cheat & Fraud]]

**Q: How does it scale to many companies?**
Multi-tenant: one backend, every query **scoped by `orgId`**, each org with its own hours/departments/Wi-Fi. 1,000+ orgs supported. → [[Architecture]]

**Q: What's the tech?**
Node + Express + Prisma + PostgreSQL backend; React/TypeScript/Tailwind web & PWA; Expo Android; Electron desktop; Next.js marketing. Backend is local-first; public hosting comes after verification. → [[Tech Stack]]

**Q: Why should I trust the numbers vs a fingerprint clock?**
A fingerprint proves a finger touched a box — not where you are or that it's the right time. We prove **presence + identity + time** on every check-in.

**Q: What's next?**
Native iOS + macOS apps, payroll/SSO integrations, analytics. → [[MVP Scope]]

**Q: Business model? (if asked)**
Per-organization SaaS subscription, tiered by employee count — the platform is already multi-tenant for it.

Related: [[Slide Deck Outline]] · [[Demo Script]]
