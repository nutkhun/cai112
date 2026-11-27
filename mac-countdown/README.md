# Blackhole Timer (macOS)

A small native Mac app (SwiftUI) that counts down from a time you set and alerts you when it's over.

## Features

- **Several timers at once**: tabs along the top, each with its own label, time and alert; press + (or ⌘T) to add one, hover a tab and click × (or right-click it) to remove it
- Set hours, minutes and seconds, or use the 1m–1h quick-start chips
- Eclipse countdown face: the glowing rim is the time remaining; the aura spreads outward and turns orange in the last minute and red in the last 10 seconds
- Pause/Resume (Space), Cancel (Esc), +1 minute
- **Reminders** before the end (1, 2, 3, 5, 10, 15, 30 min or any custom time), with an on/off switch. Each reminder chimes softly and shows a "… minutes left" notification. **Reminder rings for** sets how long the chime keeps going (once, 10 sec, 30 sec, 1 min or 3 min); a **Silence reminder** button appears while it rings. A reminder that has gone off shows as off (✓) for the rest of that countdown.
- When time is up: the alarm sound loops (up to 2 minutes), the app comes to the front with a **Time's up!** alert (Stop, Snooze 1 min, Restart), and a macOS notification appears
- The soonest-ending timer shows in the menu bar; the menu lists every timer with its own actions. Closing the window keeps timers running.
- **Spooky voice tones** in the Sound menu: Demon ("Your time is over"), Ghost, Robot, Doom Organ and Alien. Recorded with macOS voices by `scripts/make-voices.sh` (the build runs it on first use) and played through pitch, distortion, echo and reverb; reminders say "Your time is running out" in the same voice
- **Starfield background**: soft nebula clouds and an even field of stars with random sizes (a few sparkle), drifting with parallax and speeding up as time runs out; when time is up a black hole pulls them all in, spiralling into the dial, and the window goes dark
- Animations pause while the window is hidden, to save battery
- App icon: the eclipse face with "CDT", drawn by `scripts/make-icon.swift` (the build renders it on first run; delete `Resources/AppIcon.icns` to re-render after changing the design)

## Requirements

- macOS 14 Sonoma or later
- Xcode or the Xcode Command Line Tools (`xcode-select --install`)

## Build and run

Build a double-clickable app:

```bash
cd mac-countdown
./build-app.sh                     # creates "build/Blackhole Timer.app"
open "build/Blackhole Timer.app"
```

Use `./build-app.sh --install` to also copy it to `/Applications` (it replaces the app under its earlier names, `Countdown.app` and `Countdown Timer.app`).

The first time it runs, macOS asks whether Blackhole Timer may send notifications. Click **Allow** so you're alerted while the app is in the background.

For development you can also run `swift run` or open `Package.swift` in Xcode. In that mode there's no app bundle, so system notifications are turned off, but the alert window and sound still work.
