# Countdown (macOS)

A small native Mac app (SwiftUI) that counts down from a time you set and alerts you when it's over.

## Features

- Set hours, minutes and seconds, with an optional label (e.g. "Quiz", "Break")
- Quick-start presets: 1, 5, 10, 15, 25 min, 1 hour
- Animated dial: the ring drains smoothly, turns orange in the last minute and red in the last 10 seconds, with dots marking your reminder times
- Mac-style translucent window with a System Settings–style options card
- Pause/Resume (Space), Reset (Esc), +1 minute
- Reminder notifications showing how much time is left: pick any times before the end (default 5, 2 and 1 min)
- When the time is up:
  - the chosen sound loops (stops on its own after 2 minutes)
  - the app comes to the front and shows a **Time's up!** alert with **Stop**, **Snooze 1 min** and **Restart**
  - a macOS notification appears, even if the app is in the background (needs the `.app` build, see below)
- The remaining time shows in the menu bar. Closing the window keeps the countdown running, and you can control it from the menu bar icon.
- Choose from the built-in macOS alert sounds and preview them

## Requirements

- macOS 14 Sonoma or later
- Xcode or the Xcode Command Line Tools (`xcode-select --install`)

## Build and run

Build a double-clickable app:

```bash
cd mac-countdown
./build-app.sh            # creates build/Countdown.app
open build/Countdown.app
```

Use `./build-app.sh --install` to also copy it to `/Applications`.

The first time it runs, macOS asks whether Countdown may send notifications. Click **Allow** so you're alerted while the app is in the background.

For development you can also run `swift run` or open `Package.swift` in Xcode. In that mode there's no app bundle, so system notifications are turned off, but the alert window and sound still work.
