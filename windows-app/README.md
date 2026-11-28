# Blackhole Timer (Windows)

The Windows version of Blackhole Timer, built with [Electron](https://www.electronjs.org/).
It mirrors the Mac app in `../mac-countdown`: the eclipse countdown face, the flying starfield
and black hole, several timers at once, reminders with "… minutes left" notifications, and the
time's-up alarm and dialog.

## Download and run

`BlackholeTimer-1.0.0-portable.exe` is a single file: double-click it to run, no installation.

The app isn't code-signed, so the first time Windows may show **"Windows protected your PC"**.
Click **More info → Run anyway**.

Closing the window keeps your timers running in the system tray (bottom-right, near the clock).
Click the tray icon to bring the window back; right-click it to quit.

## Build

```bash
npm install
npm run dist             # dist/BlackholeTimer-<version>-portable.exe
```

On Windows, `npm run dist:installer` also builds an installer (`…-setup.exe`). Building on
Linux or macOS works without Wine for the portable .exe: `scripts/after-pack.cjs` sets the icon
and version details. The GitHub workflow `.github/workflows/windows-app.yml` builds both on
Windows whenever `windows-app/` changes, and attaches them to the run as a download.

`npm start` runs it straight from the source (on any OS) while developing.

## Icon and voices

- `npm run icon` re-renders `assets/icon.png` and `assets/icon.ico` from `scripts/icon.html`
  (needs Playwright with Chromium).
- The spooky voice tones need recordings made on a Mac (Windows doesn't have those voices).
  Record them with `../mac-countdown/scripts/make-voices.sh`, convert each to AAC
  (`afconvert -f m4af -d aac -b 32000 demon-alarm.aiff demon-alarm.m4a`), put the `.m4a` files in
  `assets/voices/`, then run `npm run voices` and rebuild. Until then the Sound menu shows only
  the synthesised tones.
