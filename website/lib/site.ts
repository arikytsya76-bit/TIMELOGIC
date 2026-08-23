/**
 * Central content + configuration for the TimeLogic marketing site.
 * Edit copy, links, and stats here. Download URLs are the only values you
 * must update for go-live (host and verify each installer, then paste its URL).
 */

export const NAV = [
  { id: "hero", label: "Home" },
  { id: "features", label: "Features" },
  { id: "platforms", label: "Platforms" },
  { id: "achievements", label: "Achievements" },
  { id: "contact", label: "Contact" },
] as const;

export type DownloadKey = "android" | "windows" | "linux" | "ios" | "mac";

export interface DownloadItem {
  key: DownloadKey;
  label: string;
  href: string | null; // null => Coming soon
  available: boolean;
}

// Build and verify a fresh Android APK before enabling its link. Host each
// installer (e.g. on Cloudflare R2, GitHub Releases, S3) and update its URL.
export const DOWNLOADS: Record<DownloadKey, DownloadItem> = {
  android: {
    key: "android",
    label: "Android",
    href: null,
    available: false,
  },
  windows: {
    key: "windows",
    label: "Windows",
    href: null,
    available: false,
  },
  linux: {
    key: "linux",
    label: "Linux",
    href: null,
    available: false,
  },
  ios: { key: "ios", label: "iOS", href: null, available: false },
  mac: { key: "mac", label: "macOS", href: null, available: false },
};

export const CONTACT = {
  email: "hello@timelogic.app",
  phone: "+234 800 000 0000",
  region: "Lagos, Nigeria · Remote-first",
};

export const FEATURES = [
  {
    title: "Wi-Fi verified check-in",
    body: "Attendance only counts on the company network. Off the Wi-Fi, off mobile data, no check-in. Enforced on Android, with no null bypass.",
    icon: "wifi",
    layer: 1,
  },
  {
    title: "One device per employee",
    body: "Each account locks to one phone the first time it is used. Another device, or a borrowed phone, is rejected. Buddy-punching is impossible.",
    icon: "smartphone",
    layer: 2,
  },
  {
    title: "Time-based check-in codes",
    body: "A short-lived, one-time code is required to check in, so scripts and screenshots of old codes never work.",
    icon: "clock",
    layer: 3,
  },
  {
    title: "Automatic sessions",
    body: "Sessions open on schedule from the set opening time. If an admin forgets, the backend opens one automatically.",
    icon: "calendar",
  },
  {
    title: "Smart late and penalty rules",
    body: "Per-organization open and close times, grace periods, late thresholds, and penalties, measured from the official opening time.",
    icon: "gauge",
  },
  {
    title: "Honest break tracking",
    body: "Breaks set per department. Wi-Fi presence confirms returns and flags anyone who overstays or comes back off-network.",
    icon: "coffee",
  },
  {
    title: "Auto check-out",
    body: "At closing time, anyone still clocked in is checked out automatically, so hours stay accurate.",
    icon: "logout",
  },
  {
    title: "Leave management",
    body: "Employees request leave with a reason. Admins approve or reject. Balances per leave type are tracked automatically.",
    icon: "umbrella",
  },
  {
    title: "Live fraud alerts",
    body: "Real-time flags for off-network breaks, overstays, repeated failed check-ins, and device mismatches.",
    icon: "shield",
  },
  {
    title: "Screenshot protection",
    body: "The employee app blocks screenshots and screen recording to protect codes and attendance data.",
    icon: "eyeoff",
  },
  {
    title: "Reports and exports",
    body: "Full attendance, break, leave, and session history, downloadable as Excel or CSV. Nothing is ever deleted.",
    icon: "filedown",
  },
  {
    title: "Built to scale",
    body: "Hundreds of organizations and thousands of employees, fully isolated, each with its own hours, departments, and Wi-Fi.",
    icon: "building",
  },
] as const;

export const STATS = [
  { value: 3, suffix: "", label: "Verification layers on every check-in", sub: "Wi-Fi, device, and time" },
  { value: 2, suffix: "", label: "Live platforms today", sub: "Android and Desktop" },
  { value: 1000, suffix: "+", label: "Organizations supported", sub: "Fully isolated tenancy" },
  { value: 0, suffix: "", label: "Records ever lost", sub: "Sessions kept permanently" },
  { value: 100, suffix: "%", label: "Configurable rules", sub: "Hours, penalties, breaks, leave" },
  { value: 24, suffix: "/7", label: "Real-time backend", sub: "Live fraud detection and presence" },
] as const;
