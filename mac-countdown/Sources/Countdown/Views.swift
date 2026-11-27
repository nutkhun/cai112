import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                if timer.state == .idle {
                    SetupView()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.9).combined(with: .opacity),
                            removal: .scale(scale: 1.12).combined(with: .opacity)
                        ))
                } else {
                    RunningView()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.75).combined(with: .opacity),
                            removal: .scale(scale: 0.9).combined(with: .opacity)
                        ))
                }
            }
            // Same height in both states, so the window doesn't jump.
            .frame(height: 370)
            .animation(.spring(response: 0.55, dampingFraction: 0.78), value: timer.state == .idle)

            SettingsCard()
        }
        .padding(.horizontal, 20)
        .padding(.top, 30)  // room for the window buttons (no title bar)
        .padding(.bottom, 20)
        .frame(width: 400)
        .background(VisualEffectBackground().ignoresSafeArea())
    }
}

// MARK: - Setting the time

private struct SetupView: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 26) {
            HStack(alignment: .center, spacing: 2) {
                DigitField(value: $timer.hours, range: 0...99, unit: "hours")
                colon
                DigitField(value: $timer.minutes, range: 0...59, unit: "min")
                colon
                DigitField(value: $timer.seconds, range: 0...59, unit: "sec")
            }

            HStack(spacing: 6) {
                ForEach(CountdownTimer.presets, id: \.seconds) { preset in
                    Button(preset.short) { timer.start(presetSeconds: preset.seconds) }
                        .buttonStyle(ChipStyle())
                        .help("Start \(preset.title)")
                }
            }

            Button {
                timer.start()
            } label: {
                Label("Start", systemImage: "play.fill")
                    .frame(width: 150)
            }
            .buttonStyle(PillButtonStyle(filled: true, large: true))
            .keyboardShortcut(.defaultAction)
            .disabled(timer.configuredDuration == 0)
        }
    }

    private var colon: some View {
        Text(":")
            .font(.system(size: 44, weight: .ultraLight, design: .rounded))
            .foregroundStyle(.tertiary)
            .offset(y: -10)
    }
}

/// Big two-digit number you can type into, with ▲▼ buttons that wrap around.
private struct DigitField: View {
    @Binding var value: Int
    let range: ClosedRange<Int>
    let unit: String
    @State private var hovering = false

    var body: some View {
        VStack(spacing: 2) {
            stepButton("chevron.up") {
                value = value >= range.upperBound ? range.lowerBound : value + 1
            }
            TextField("", value: $value, format: .number.precision(.integerLength(2)))
                .textFieldStyle(.plain)
                .font(.system(size: 54, weight: .light, design: .rounded).monospacedDigit())
                .multilineTextAlignment(.center)
                .frame(width: 84)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.primary.opacity(hovering ? 0.08 : 0.04))
                )
            stepButton("chevron.down") {
                value = value <= range.lowerBound ? range.upperBound : value - 1
            }
            Text(unit)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
    }

    private func stepButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .frame(width: 84, height: 16)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .opacity(hovering ? 1 : 0.35)
    }
}

// MARK: - Counting down

private struct RunningView: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 22) {
            // Redraws ~30× a second so the ring drains smoothly and the glow breathes.
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: timer.state == .idle)) { context in
                dial(at: context.date)
            }
            controls
        }
    }

    private func dial(at date: Date) -> some View {
        let t = date.timeIntervalSinceReferenceDate
        let breath = (sin(t * 2.4) + 1) / 2  // 0…1
        let finished = timer.state == .finished
        let progress = finished ? 1 : timer.progress(at: date)

        return ZStack {
            // Soft glow behind the ring.
            Circle()
                .fill(tint.opacity(finished ? 0.4 : 0.22))
                .frame(width: 180, height: 180)
                .blur(radius: 40)
                .scaleEffect(0.9 + (finished ? 0.3 : 0.14) * breath)

            ProgressRing(progress: progress, color: tint, markers: reminderMarkers)
                .scaleEffect(finished ? 1 + 0.03 * breath : 1)

            center
                .opacity(timer.state == .paused ? 0.4 + 0.6 * breath : 1)
        }
        .frame(width: 270, height: 270)
        .animation(.easeInOut(duration: 0.6), value: tint)
    }

    @ViewBuilder private var center: some View {
        if timer.state == .finished {
            VStack(spacing: 8) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 42))
                    .foregroundStyle(.red)
                    .phaseAnimator([-16.0, 16.0]) { content, angle in
                        content.rotationEffect(.degrees(angle), anchor: .top)
                    } animation: { _ in
                        .easeInOut(duration: 0.13)
                    }
                Text("Time's up!")
                    .font(.title2.weight(.semibold))
            }
            .transition(.scale.combined(with: .opacity))
        } else {
            VStack(spacing: 4) {
                if !timer.label.isEmpty {
                    Text(timer.label)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .frame(maxWidth: 160)
                }
                Text(timer.remainingText)
                    .font(.system(size: 50, weight: .light, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText(countsDown: true))
                    .animation(.snappy, value: timer.remainingText)
                    // A little "heartbeat" each second during the last 10 seconds.
                    .phaseAnimator([1.0, 1.12], trigger: heartbeat) { content, scale in
                        content.scaleEffect(scale)
                    } animation: { _ in
                        .spring(response: 0.2, dampingFraction: 0.5)
                    }
                HStack(spacing: 5) {
                    Image(systemName: timer.state == .paused ? "pause.fill" : "bell.fill")
                    Text(statusText)
                }
                .font(.callout)
                .foregroundStyle(.secondary)
            }
        }
    }

    /// Compact control bar: ✕ cancel, a glowing play/pause button, and +1 minute.
    private var controls: some View {
        HStack(spacing: 26) {
            Button {
                timer.reset()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(GhostIconButtonStyle())
            .keyboardShortcut(.cancelAction)
            .help("Cancel (Esc)")

            Button {
                timer.togglePause()
            } label: {
                Image(systemName: timer.state == .running ? "pause.fill" : "play.fill")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(PrimaryCircleButtonStyle(tint: tint))
            .keyboardShortcut(.space, modifiers: [])
            .disabled(!timer.isActive)
            .opacity(timer.isActive ? 1 : 0)
            .help(timer.state == .running ? "Pause (Space)" : "Resume (Space)")

            Button {
                timer.addTime(60)
            } label: {
                Text("+1m")
            }
            .buttonStyle(GhostIconButtonStyle())
            .disabled(!timer.isActive)
            .help("Add 1 minute")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .background(
            Capsule().fill(Color.primary.opacity(0.04))
        )
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.06)))
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: timer.state)
    }

    /// Blue normally, orange in the last minute, red in the last 10 seconds.
    private var tint: Color {
        switch timer.state {
        case .paused: return .gray
        case .finished: return .red
        default:
            if timer.remaining <= 10 { return .red }
            if timer.remaining <= 60 { return .orange }
            return .accentColor
        }
    }

    private var heartbeat: Int {
        guard timer.state == .running, timer.remaining <= 10 else { return 0 }
        return Int(timer.remaining.rounded(.up))
    }

    /// Where each reminder sits on the ring, as a fraction of the whole countdown.
    private var reminderMarkers: [Double] {
        guard timer.total > 0 else { return [] }
        return timer.reminderMinutes
            .map { Double($0 * 60) / timer.total }
            .filter { $0 > 0 && $0 < 1 }
    }

    private var statusText: String {
        switch timer.state {
        case .running:
            guard let end = timer.endDate else { return "" }
            return end.formatted(date: .omitted, time: .shortened)
        case .paused: return "Paused"
        case .finished: return "Time's up!"
        case .idle: return ""
        }
    }
}

/// The countdown dial: watch-face ticks, a draining gradient ring with a glowing tip,
/// and dots marking the reminder times.
private struct ProgressRing: View {
    /// Fraction of time left, 1 → 0.
    let progress: Double
    let color: Color
    let markers: [Double]
    var size: CGFloat = 214
    var lineWidth: CGFloat = 10

    var body: some View {
        let radius = size / 2
        let visible = max(progress, 0.0001)

        ZStack {
            ForEach(0..<60, id: \.self) { i in
                let major = i % 5 == 0
                Capsule()
                    .fill(Color.primary.opacity(major ? 0.28 : 0.12))
                    .frame(width: major ? 2 : 1, height: major ? 7 : 4)
                    .offset(y: -(radius + 18))
                    .rotationEffect(.degrees(Double(i) * 6))
            }

            Circle()
                .stroke(Color.primary.opacity(0.08), lineWidth: lineWidth)

            Circle()
                .trim(from: 0, to: visible)
                .stroke(
                    AngularGradient(
                        colors: [color.opacity(0.3), color],
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(visible * 360)
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: color.opacity(0.5), radius: 6)

            ForEach(markers, id: \.self) { fraction in
                // Bright while still ahead (on the coloured part), faded once passed.
                Circle()
                    .fill(fraction < progress ? Color.white.opacity(0.95) : Color.primary.opacity(0.3))
                    .frame(width: 4, height: 4)
                    .offset(y: -radius)
                    .rotationEffect(.degrees(fraction * 360))
            }

            if progress > 0 {
                Circle()
                    .fill(Color.white)
                    .frame(width: lineWidth - 2, height: lineWidth - 2)
                    .shadow(color: color, radius: 5)
                    .offset(y: -radius)
                    .rotationEffect(.degrees(progress * 360))
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Settings card

private struct SettingsCard: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 0) {
            if !timer.notificationsAllowed {
                SettingRow(icon: "bell.slash", title: "Notifications are off", iconColor: .red) {
                    Button("Turn On") { Notifier.openSettings() }
                        .buttonStyle(ChipStyle(isOn: true))
                        .help("Open System Settings → Notifications → Countdown and turn on Allow Notifications")
                }
                divider
            }

            SettingRow(icon: "tag", title: "Label") {
                if timer.state == .idle {
                    TextField("Add label", text: $timer.label)
                        .textFieldStyle(.plain)
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: 200)
                } else {
                    Text(timer.label.isEmpty ? "None" : timer.label)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }

            divider
            ReminderSection()

            divider
            SoundRow()
        }
        .font(.system(size: 13))
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.primary.opacity(0.035))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.07))
        )
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.06))
            .frame(height: 1)
            .padding(.leading, 42)
    }
}

/// One settings row: thin monochrome icon, title, and a control on the right.
private struct SettingRow<Trailing: View>: View {
    let icon: String
    let title: String
    var iconColor: Color = .secondary
    let trailing: Trailing

    init(icon: String, title: String, iconColor: Color = .secondary,
         @ViewBuilder trailing: () -> Trailing) {
        self.icon = icon
        self.title = title
        self.iconColor = iconColor
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(iconColor)
                .frame(width: 16)
            Text(title)
                .foregroundStyle(.primary)
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 42)
    }
}

/// Pick how many minutes before the end a "… minutes left" notification pops up.
private struct ReminderSection: View {
    @EnvironmentObject private var timer: CountdownTimer
    @State private var customMinutes: Int?
    @State private var addingCustom = false
    @FocusState private var customFocused: Bool

    /// The standard choices plus any custom values the user added.
    private var options: [Int] {
        Set(CountdownTimer.reminderChoices + timer.reminderMinutes).sorted()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SettingRow(icon: "bell", title: "Reminders") {
                Text(summary)
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
                    .contentTransition(.numericText())
                    .animation(.snappy, value: summary)
            }

            FlowLayout(spacing: 6) {
                ForEach(options, id: \.self) { minutes in
                    let isOn = timer.isReminderOn(minutes)
                    Button("\(minutes)m") {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            timer.toggleReminder(minutes)
                        }
                    }
                    .buttonStyle(ChipStyle(isOn: isOn))
                    .help(isOn ? "Turn off the \(minutes)-minute reminder"
                               : "Remind me \(minutes) min before the end")
                }
                customChip
            }
            .padding(.leading, 42)
            .padding(.trailing, 14)
            .padding(.bottom, 12)
        }
    }

    /// "+ Custom" chip that turns into a small number field.
    @ViewBuilder private var customChip: some View {
        if addingCustom {
            HStack(spacing: 2) {
                TextField("0", value: $customMinutes, format: .number)
                    .textFieldStyle(.plain)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 28)
                    .focused($customFocused)
                    .onSubmit(addCustom)
                    .onExitCommand { closeCustom() }
                Text("m")
                    .foregroundStyle(.secondary)
            }
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(Capsule().fill(Color.primary.opacity(0.08)))
            .overlay(Capsule().strokeBorder(Color.accentColor.opacity(0.6)))
            .transition(.scale.combined(with: .opacity))
            .onChange(of: customFocused) { _, focused in
                if !focused { closeCustom() }
            }
        } else {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { addingCustom = true }
                DispatchQueue.main.async { customFocused = true }
            } label: {
                Label("Custom", systemImage: "plus")
            }
            .buttonStyle(ChipStyle())
            .help("Add a reminder at any number of minutes before the end")
        }
    }

    private var summary: String {
        let list = timer.reminderMinutes
        guard !list.isEmpty else { return "Off" }
        return list.map(String.init).joined(separator: ", ") + " min before"
    }

    private func addCustom() {
        if let minutes = customMinutes {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                timer.addReminder(minutes)
            }
        }
        closeCustom()
    }

    private func closeCustom() {
        customMinutes = nil
        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { addingCustom = false }
    }
}

private struct SoundRow: View {
    @EnvironmentObject private var timer: CountdownTimer
    @State private var previews = 0

    var body: some View {
        SettingRow(icon: "speaker.wave.2", title: "Sound") {
            Menu {
                Picker("Sound", selection: $timer.soundName) {
                    ForEach(AlarmPlayer.sounds, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } label: {
                HStack(spacing: 4) {
                    Text(timer.soundName)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 9, weight: .semibold))
                }
                .foregroundStyle(.secondary)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()

            Button {
                previews += 1
                timer.previewSound()
            } label: {
                Image(systemName: "play.fill")
                    .symbolEffect(.bounce, value: previews)
            }
            .buttonStyle(GhostIconButtonStyle(size: 26))
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
