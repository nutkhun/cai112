import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 20) {
            if timer.state == .idle {
                SetupView()
            } else {
                RunningView()
            }
            Divider()
            ReminderPicker()
            SoundPicker()
        }
        .padding(24)
        .frame(width: 380)
    }
}

// MARK: - Setting the time

private struct SetupView: View {
    @EnvironmentObject private var timer: CountdownTimer

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)

    var body: some View {
        VStack(spacing: 18) {
            TextField("Label (optional)", text: $timer.label)
                .textFieldStyle(.roundedBorder)

            HStack(alignment: .top, spacing: 10) {
                TimeUnitField(title: "Hours", value: $timer.hours, range: 0...99)
                separator
                TimeUnitField(title: "Minutes", value: $timer.minutes, range: 0...59)
                separator
                TimeUnitField(title: "Seconds", value: $timer.seconds, range: 0...59)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Quick start")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(CountdownTimer.presets, id: \.seconds) { preset in
                        Button {
                            timer.start(presetSeconds: preset.seconds)
                        } label: {
                            Text(preset.title).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }

            Button {
                timer.start()
            } label: {
                Label("Start", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .keyboardShortcut(.defaultAction)
            .disabled(timer.configuredDuration == 0)
        }
    }

    private var separator: some View {
        Text(":")
            .font(.title2)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
    }
}

private struct TimeUnitField: View {
    let title: String
    @Binding var value: Int
    let range: ClosedRange<Int>

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 2) {
                TextField(title, value: $value, format: .number)
                    .textFieldStyle(.roundedBorder)
                    .multilineTextAlignment(.center)
                    .font(.title2.monospacedDigit())
                    .frame(width: 54)
                Stepper(title, value: $value, in: range)
                    .labelsHidden()
            }
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Counting down

private struct RunningView: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 20) {
            if !timer.label.isEmpty {
                Text(timer.label)
                    .font(.headline)
                    .lineLimit(1)
            }

            ZStack {
                Circle()
                    .stroke(Color.secondary.opacity(0.2), lineWidth: 12)
                Circle()
                    .trim(from: 0, to: timer.progress)
                    .stroke(ringColor, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.1), value: timer.progress)
                VStack(spacing: 6) {
                    Text(timer.remainingText)
                        .font(.system(size: 48, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text(statusText)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 220, height: 220)

            HStack(spacing: 10) {
                Button {
                    timer.reset()
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise")
                }
                .keyboardShortcut(.cancelAction)

                if timer.isActive {
                    Button {
                        timer.togglePause()
                    } label: {
                        if timer.state == .running {
                            Label("Pause", systemImage: "pause.fill")
                        } else {
                            Label("Resume", systemImage: "play.fill")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.space, modifiers: [])

                    Button {
                        timer.addTime(60)
                    } label: {
                        Label("1 min", systemImage: "plus")
                    }
                }
            }
            .controlSize(.large)
        }
    }

    private var ringColor: Color {
        switch timer.state {
        case .paused: return .orange
        case .finished: return .red
        default: return timer.remaining <= 10 ? .red : .accentColor
        }
    }

    private var statusText: String {
        switch timer.state {
        case .running:
            guard let end = timer.endDate else { return "" }
            return "Ends at \(end.formatted(date: .omitted, time: .shortened))"
        case .paused: return "Paused"
        case .finished: return "Time's up!"
        case .idle: return ""
        }
    }
}

// MARK: - Reminders

/// Pick how many minutes before the end a "… minutes left" notification pops up.
private struct ReminderPicker: View {
    @EnvironmentObject private var timer: CountdownTimer
    @State private var otherMinutes: Int?

    private let columns = [GridItem(.adaptive(minimum: 54), spacing: 6)]

    /// The standard choices plus any custom values the user added.
    private var options: [Int] {
        Set(CountdownTimer.reminderChoices + timer.reminderMinutes).sorted()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Remind me before the end")
            Text(summary)
                .font(.caption)
                .foregroundStyle(.secondary)

            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(options, id: \.self) { minutes in
                    chip(minutes)
                }
            }

            HStack(spacing: 6) {
                Text("Other:")
                TextField("min", value: $otherMinutes, format: .number)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 56)
                    .onSubmit(addOther)
                Text("min before")
                Button("Add", action: addOther)
                    .disabled(otherMinutes == nil)
            }
            .font(.callout)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chip(_ minutes: Int) -> some View {
        let isOn = timer.isReminderOn(minutes)
        return Button {
            timer.toggleReminder(minutes)
        } label: {
            Text("\(minutes) min")
                .font(.callout)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity)
                .foregroundStyle(isOn ? Color.white : Color.primary)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isOn ? Color.accentColor : Color.secondary.opacity(0.15))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(isOn ? "Turn off the \(minutes)-minute reminder" : "Remind me \(minutes) min before the end")
    }

    private var summary: String {
        let list = timer.reminderMinutes
        guard !list.isEmpty else { return "No reminders. Click a time to add one." }
        let parts = list.map(String.init)
        let joined = parts.count == 1
            ? parts[0]
            : parts.dropLast().joined(separator: ", ") + " and " + parts.last!
        return "A notification pops up \(joined) min before the time is up."
    }

    private func addOther() {
        guard let minutes = otherMinutes else { return }
        timer.addReminder(minutes)
        otherMinutes = nil
    }
}

// MARK: - Sound

private struct SoundPicker: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        HStack {
            Text("Alert sound")
            Spacer()
            Picker("Alert sound", selection: $timer.soundName) {
                ForEach(AlarmPlayer.sounds, id: \.self) { Text($0) }
            }
            .labelsHidden()
            .frame(width: 130)
            Button {
                timer.previewSound()
            } label: {
                Image(systemName: "speaker.wave.2.fill")
            }
            .help("Play this sound")
        }
    }
}

// MARK: - Menu bar

struct MenuBarMenu: View {
    @EnvironmentObject private var timer: CountdownTimer
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        switch timer.state {
        case .running:
            Button("Pause") { timer.pause() }
            Button("Add 1 Minute") { timer.addTime(60) }
            Button("Reset") { timer.reset() }
        case .paused:
            Button("Resume") { timer.resume() }
            Button("Add 1 Minute") { timer.addTime(60) }
            Button("Reset") { timer.reset() }
        case .idle, .finished:
            ForEach(CountdownTimer.presets, id: \.seconds) { preset in
                Button("Start \(preset.title)") { timer.start(presetSeconds: preset.seconds) }
            }
        }

        Divider()

        Button("Show Window") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Button("Quit Countdown") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}
