# TimeLogic

TimeLogic is a multi-platform attendance system with a Node/Express backend,
an Electron admin app, an Android employee app, a PWA, a super-admin web app,
and a marketing site.

## Security notice

The repository previously contained repeated `Unhide Files.bat` files with an
embedded executable payload. Every matching copy has been removed. Do not
restore or run those files. If one was ever executed or double-clicked, run a
full Microsoft Defender Offline scan before using credentials on this computer.

## Project folders

| Folder | Purpose | Local port |
| --- | --- | --- |
| `backend` | Express, Prisma, PostgreSQL, and Redis API | 5000 |
| `desktop` | Electron admin app for Windows and Linux | 5173 |
| `mobile` | Android-only Expo employee app | Expo/Metro |
| `pwa` | Employee PWA | 5180 |
| `web` | Super-admin web app | 3000 |
| `website` | Marketing site | 3000 by default |

## Requirements

- Node.js 20.19.4 or newer (Node 20 LTS is the reproducible target)
- Docker Desktop, or separate PostgreSQL 16 and Redis 7 installations
- An Android phone with Expo Go, or Android Studio/JDK 17 for an emulator

PowerShell on this machine blocks `npm.ps1`, so use `npm.cmd` and `npx.cmd` in
PowerShell. Regular `npm` and `npx` work from Command Prompt.

To enable the full backend and a native APK build on Windows, open PowerShell
as Administrator and install the missing machine-level tools:

```powershell
winget install --id Docker.DockerDesktop --exact --source winget
winget install --id EclipseAdoptium.Temurin.17.JDK --exact --source winget
winget install --id Google.AndroidStudio --exact --source winget
```

Restart Windows if Docker requests it. In Android Studio's SDK Manager, install
Android SDK Platform 36, Android SDK Build-Tools 36.0.0, and Platform-Tools.
Then reopen the terminal so `java`, `adb`, and Docker are available on `PATH`.

## Install dependencies

Each app is independent and has its own lockfile:

```powershell
foreach ($app in 'backend','desktop','mobile','pwa','web','website') {
  Push-Location $app
  npm.cmd ci
  Pop-Location
}
```

## Start the local backend

Start PostgreSQL and Redis:

```powershell
docker compose up -d
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

Replace the three `your_*_here` values in `backend/.env` with long random
development secrets. Generate each one with:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Prepare and run the API:

```powershell
Set-Location backend
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

The health endpoint is `http://localhost:5000/health`. The initial super-admin
login is `superadmin@acme.com` / `Admin@1234`; change it after first login.

With the backend still running, verify the complete local attendance flow in a
second terminal. The command creates an isolated temporary organization, tests
the APIs, and removes its test data afterward:

```powershell
Set-Location backend
npm.cmd run verify:local
```

## Attendance modes

- The Super Admin enables phone/device attendance, manual employee attendance,
  student attendance, or the applicable combination for each organization.
- Each employee is assigned `PHONE`, `MANUAL`, or `BOTH`. A manual employee
  uses the authenticated Desktop Admin station and confirms their own password.
- Employee phone and manual check-ins require a live office session. Times,
  lateness, and penalties are calculated by the backend clock using the office
  timezone and configured opening rules; client-supplied times are ignored.
- Students use a separate Desktop Admin tab and manual check-in/out flow. They
  do not use employee sessions, lateness, penalties, devices, or phone login.
- Every explicit Admin login is stored and evaluated against the organization's
  opening-time rules. The Desktop header shows the database-backed login time.

## Run the desktop admin app

With the backend running, open another terminal:

```powershell
Set-Location desktop
npm.cmd run dev
```

Build the normal metadata-ready Windows x64 installer with `npm.cmd run
dist:win` after enabling Windows Developer Mode (or running an elevated
shell). It remains unsigned unless code-signing credentials are configured.
For a local unsigned installer that does not require the symlink/signing
privilege, use `npm.cmd run dist:win:unsigned`.

Build Linux natively with `npm run dist:linux` on Ubuntu/Debian. On Windows,
`npm.cmd run dist:linux:windows` creates the Linux app and wraps it in a
standards-format Debian package without requiring Ruby/FPM. Artifacts are
written to `desktop/release/`:

- `TimeLogic-Admin-Setup-1.0.0.exe`
- `TimeLogic-Admin-1.0.0-amd64.deb`

## Run the Android app

For Expo Go on a physical phone, leave `mobile/.env.local` without an API URL.
In development the app follows the LAN address advertised by Metro, so the
phone and computer only need to be on the same network. Then:

```powershell
Set-Location mobile
npm.cmd run start -- --lan --clear
```

Scan the new QR code with Expo Go. If the computer changes Wi-Fi networks or
receives a new LAN address, stop Metro with Ctrl+C and run the same command
again. Do not combine `--offline` with `--lan`; Expo treats those as competing
host modes. For an Android Studio emulator, the configured fallback is
`http://10.0.2.2:5000/api`; after installing the JDK and Android SDK, use
`npm.cmd run android`. Validate the Android JS bundle with `npm.cmd run
build:android`. That command creates an Android-only Expo bundle, not an APK.
A local APK build additionally requires JDK 17 and Android SDK 36; the existing
`eas.json` preview profile is configured to emit an APK. Its private LAN API
address must match the computer's current IPv4 address before each standalone
build. The app rejects public backend URLs while local-only mode is enabled.

## Other local apps

Run these commands from the `TIMELOGIC` project root, each in its own terminal:

```powershell
npm.cmd --prefix web run dev
npm.cmd --prefix pwa run dev
npm.cmd --prefix website run dev -- -p 3001
```

The website uses port 3001 above to avoid colliding with the super-admin app.
To open the employee PWA from a phone on the same network, use
`http://<computer-LAN-IPv4>:5180`; it automatically targets the backend on that
same computer.
