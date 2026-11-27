#!/usr/bin/env bash
# Records the spoken alert tones into Resources/Voices with macOS `say`.
# The app adds the demon/ghost/robot effects when it plays them (see VoiceTones.swift).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=Resources/Voices
mkdir -p "$OUT"

# record <file stem> <voice> <words per minute> <alarm phrase> <reminder phrase>
record() {
    local voice="$2"
    if ! say -v '?' | grep -q "^$2 "; then
        voice="Fred"  # fallback if this Mac doesn't have the voice
    fi
    say -v "$voice" -r "$3" -o "$OUT/$1-alarm.aiff" "$4"
    say -v "$voice" -r "$3" -o "$OUT/$1-reminder.aiff" "$5"
    echo "  $1: $voice"
}

record demon "Ralph"    150 "Your time is over."              "Your time is running out."
record ghost "Whisper"  140 "Your time... is up."             "Your time... is running out."
record robot "Zarvox"   170 "Time is over. Time is over."     "Warning. Time is running out."
record organ "Bad News" 170 "Your time is over."              "Your time is running out."
record alien "Trinoids" 160 "Your time has ended, earthling." "Earthling. Your time is running out."

echo "Wrote $OUT"
