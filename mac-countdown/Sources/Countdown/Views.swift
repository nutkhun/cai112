import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject private var timer: CountdownTimer
    @State private var windowVisible = true

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                if timer.state == .idle {
                    SetupView()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.9).combined(with: .opacity),
                            removal: .scale(scale: 1.15).combined(with: .opacity)
                        ))
                } else {
                    RunningView()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.7).combined(with: .opacity),
                            removal: .scale(scale: 0.9).combined(with: .opacity)
                        ))
                }
            }
            // Same height in both states, so the window doesn't jump.
            .frame(height: 392)
            .animation(.spring(response: 0.6, dampingFraction: 0.8), value: timer.state == .idle)

            SettingsCard()
        }
        .padding(.horizontal, 20)
        .padding(.top, 26)  // room for the window buttons (no title bar)
        .padding(.bottom, 20)
        .frame(width: 400)
        .foregroundStyle(.white)
        .background(SpaceBackground())
        .background(WindowVisibilityReader(isVisible: $windowVisible))
        .environment(\.animationsPaused, !windowVisible)
        .preferredColorScheme(.dark)
    }
}

// MARK: - Setting the time

private struct SetupView: View {
    @EnvironmentObject private var timer: CountdownTimer
    @Environment(\.animationsPaused) private var animationsPaused

    var body: some View {
        ZStack {
            // A calm, dim orb breathing behind the digits.
            TimelineView(.animation(minimumInterval: 1.0 / 24, paused: animationsPaused)) { context in
                OrbView(time: context.date.timeIntervalSinceReferenceDate,
                        palette: Theme.calm, energy: 0.1, intensity: 0.55)
            }
            .frame(width: 340, height: 340)
            .offset(y: -36)
            .allowsHitTesting(false)

            VStack(spacing: 22) {
                Text("SET TIMER")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(4)
                    .foregroundStyle(.white.opacity(0.45))

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
                            .buttonStyle(GlassChipStyle())
                            .help("Start \(preset.title)")
                    }
                }

                Button {
                    timer.start()
                } label: {
                    Label("Start", systemImage: "play.fill")
                        .frame(width: 130)
                }
                .buttonStyle(GlassCapsuleButtonStyle())
                .keyboardShortcut(.defaultAction)
                .disabled(timer.configuredDuration == 0)
            }
        }
    }

    private var colon: some View {
        Text(":")
            .font(.system(size: 44, weight: .ultraLight))
            .foregroundStyle(.white.opacity(0.3))
            .offset(y: -10)
    }
}

/// Big thin two-digit number you can type into, with ▲▼ buttons that wrap around.
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
                .font(.system(size: 54, weight: .thin).monospacedDigit())
                .multilineTextAlignment(.center)
                .frame(width: 84)
                .padding(.vertical, 2)
                .glassPanel(cornerRadius: 14)
                .shadow(color: Theme.cyan.opacity(hovering ? 0.25 : 0), radius: 10)
            stepButton("chevron.down") {
                value = value <= range.lowerBound ? range.upperBound : value - 1
            }
            Text(unit.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .tracking(2)
                .foregroundStyle(.white.opacity(0.4))
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
        .foregroundStyle(.white.opacity(hovering ? 0.8 : 0.3))
    }
}

// MARK: - Counting down

private struct RunningView: View {
    @EnvironmentObject private var timer: CountdownTimer
    @Environment(\.animationsPaused) private var animationsPaused

    var body: some View {
        VStack(spacing: 14) {
            // Redraws ~24× a second: ribbons drift, particles twinkle, the arc drains smoothly.
            TimelineView(.animation(minimumInterval: 1.0 / 24, paused: animationsPaused || timer.state == .idle)) { context in
                dial(at: context.date)
            }
            controls
        }
    }

    // MARK: Dial

    private func dial(at date: Date) -> some View {
        let t = date.timeIntervalSinceReferenceDate
        let breath = (sin(t * 2.4) + 1) / 2  // 0…1
        let finished = timer.state == .finished
        let live = timer.remaining(at: date)
        let progress = finished ? 1 : (timer.total > 0 ? live / timer.total : 0)
        let dim = timer.state == .paused ? 0.35 + 0.35 * breath : 1

        return ZStack {
            OrbView(time: t, palette: palette, energy: energy, intensity: dim)
                .frame(width: 300, height: 300)

            GlassDisc(tint: rimTint, rotation: t * 14)
                .frame(width: 180, height: 180)

            ParticleField(time: t, energy: energy, intensity: dim)
                .frame(width: 168, height: 168)
                .clipShape(Circle())

            ProgressArc(progress: progress, color: arcColor)
                .frame(width: 210, height: 210)

            // Small marker at 12 o'clock, where the arc starts and ends.
            Image(systemName: "arrowtriangle.down.fill")
                .font(.system(size: 6))
                .foregroundStyle(.white.opacity(0.7))
                .offset(y: -82)

            ForEach(reminderMarks, id: \.minutes) { mark in
                reminderLabel(mark, progress: progress)
            }

            center(live: live)
                .opacity(timer.state == .paused ? 0.45 + 0.55 * breath : 1)
        }
        .frame(width: 300, height: 300)
    }

    private struct ReminderMark {
        let minutes: Int
        let fraction: Double
    }

    /// Reminder times that fall inside this countdown, placed around the ring.
    private var reminderMarks: [ReminderMark] {
        guard timer.total > 0 else { return [] }
        return timer.activeReminderMinutes
            .map { ReminderMark(minutes: $0, fraction: Double($0 * 60) / timer.total) }
            .filter { $0.fraction > 0 && $0.fraction < 1 }
    }

    private func reminderLabel(_ mark: ReminderMark, progress: Double) -> some View {
        let angle = mark.fraction * 2 * .pi
        let upcoming = mark.fraction < progress
        return ZStack {
            // Dot on the arc band…
            Circle()
                .fill(upcoming ? Color.white : Color.white.opacity(0.25))
                .frame(width: 4, height: 4)
                .offset(x: sin(angle) * 105, y: -cos(angle) * 105)
            // …and its label outside the ribbons.
            Text("\(mark.minutes)m")
                .font(.system(size: 9, weight: .medium).monospacedDigit())
                .foregroundStyle(.white.opacity(upcoming ? 0.75 : 0.25))
                .offset(x: sin(angle) * 140, y: -cos(angle) * 140)
        }
        .animation(.easeInOut(duration: 0.4), value: upcoming)
    }

    @ViewBuilder private func center(live: TimeInterval) -> some View {
        if timer.state == .finished {
            VStack(spacing: 8) {
                Image(systemName: "bell.fill")
                    .font(.system(size: 38))
                    .foregroundStyle(LinearGradient(colors: [Theme.coral, .red], startPoint: .top, endPoint: .bottom))
                    .shadow(color: .red.opacity(0.7), radius: 10)
                    .phaseAnimator([-16.0, 16.0]) { content, angle in
                        content.rotationEffect(.degrees(angle), anchor: .top)
                    } animation: { _ in
                        .easeInOut(duration: 0.13)
                    }
                Text("TIME'S UP")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(4)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .transition(.scale.combined(with: .opacity))
        } else {
            let whole = Int(live)
            let tenths = Int((live - Double(whole)) * 10)
            let mainText = Self.clock(whole)

            VStack(spacing: 4) {
                Text(timer.label.isEmpty ? "REMAINING" : timer.label.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(3)
                    .foregroundStyle(.white.opacity(0.45))
                    .lineLimit(1)
                    .frame(maxWidth: 140)

                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(mainText)
                        .font(.system(size: whole >= 3600 ? 34 : 46, weight: .thin))
                        .monospacedDigit()
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: mainText)
                    Text(".\(tenths)")
                        .font(.system(size: 16, weight: .light))
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.55))
                }
                // A little "heartbeat" each second during the last 10 seconds.
                .phaseAnimator([1.0, 1.1], trigger: heartbeat) { content, scale in
                    content.scaleEffect(scale)
                } animation: { _ in
                    .spring(response: 0.2, dampingFraction: 0.5)
                }

                HStack(spacing: 4) {
                    Image(systemName: timer.state == .paused ? "pause.fill" : "bell.fill")
                        .font(.system(size: 8))
                    Text(statusText)
                }
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.45))
            }
        }
    }

    // MARK: Controls

    /// Glass control bar: ✕ cancel, the glowing play/pause orb, and +1 minute.
    private var controls: some View {
        HStack(spacing: 26) {
            Button {
                timer.reset()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(GlassIconButtonStyle())
            .keyboardShortcut(.cancelAction)
            .help("Cancel (Esc)")

            Button {
                timer.togglePause()
            } label: {
                Image(systemName: timer.state == .running ? "pause.fill" : "play.fill")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(GlassOrbButtonStyle(tint: orbTint))
            .keyboardShortcut(.space, modifiers: [])
            .disabled(!timer.isActive)
            .opacity(timer.isActive ? 1 : 0)
            .help(timer.state == .running ? "Pause (Space)" : "Resume (Space)")

            Button {
                timer.addTime(60)
            } label: {
                Text("+1m")
            }
            .buttonStyle(GlassIconButtonStyle())
            .disabled(!timer.isActive)
            .help("Add 1 minute")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 7)
        .glassPanel(cornerRadius: 40)
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: timer.state)
    }

    // MARK: Mood (colours and motion by urgency)

    private enum Mood { case calm, lastMinute, final, paused, finished }

    private var mood: Mood {
        switch timer.state {
        case .paused: return .paused
        case .finished: return .finished
        default:
            if timer.remaining <= 10 { return .final }
            if timer.remaining <= 60 { return .lastMinute }
            return .calm
        }
    }

    private var palette: [Color] {
        switch mood {
        case .calm: return Theme.calm
        case .lastMinute: return Theme.warm
        case .final, .finished: return Theme.alarm
        case .paused: return Theme.rest
        }
    }

    private var energy: Double {
        switch mood {
        case .calm: return 0.3
        case .lastMinute: return 0.6
        case .final: return 1.0
        case .finished: return 1.3
        case .paused: return 0
        }
    }

    private var rimTint: Color {
        switch mood {
        case .calm: return Theme.blue
        case .lastMinute: return Theme.coral
        case .final, .finished: return .red
        case .paused: return .gray
        }
    }

    private var arcColor: Color {
        switch mood {
        case .calm: return Theme.mint
        case .lastMinute: return Theme.coral
        case .final, .finished: return .red
        case .paused: return Color(white: 0.6)
        }
    }

    private var orbTint: Color {
        switch mood {
        case .calm: return Theme.blue
        case .lastMinute: return Theme.coral
        case .final, .finished: return .red
        case .paused: return Theme.violet
        }
    }

    private var heartbeat: Int {
        guard timer.state == .running, timer.remaining <= 10 else { return 0 }
        return Int(timer.remaining.rounded(.up))
    }

    private var statusText: String {
        switch timer.state {
        case .running:
            guard let end = timer.endDate else { return "" }
            return end.formatted(date: .omitted, time: .shortened)
        case .paused: return "PAUSED"
        case .finished, .idle: return ""
        }
    }

    /// "4:59" / "1:02:03", rounded down (the tenths are shown separately).
    private static func clock(_ seconds: Int) -> String {
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
    }
}

/// Glassy progress band around the disc: a soft gradient arc with a glow, draining clockwise to 12.
private struct ProgressArc: View {
    let progress: Double
    let color: Color
    var lineWidth: CGFloat = 12

    var body: some View {
        let visible = max(progress, 0.0001)
        let gradient = AngularGradient(colors: [color.opacity(0.25), color.opacity(0.95)],
                                       center: .center,
                                       startAngle: .degrees(0),
                                       endAngle: .degrees(visible * 360))

        ZStack {
            Circle().stroke(Color.white.opacity(0.05), lineWidth: lineWidth)
            // Glow: a wide, faint copy of the arc.
            Circle()
                .trim(from: 0, to: visible)
                .stroke(gradient, style: StrokeStyle(lineWidth: lineWidth * 2.4, lineCap: .butt))
                .opacity(0.16)
                .rotationEffect(.degrees(-90))
            Circle()
                .trim(from: 0, to: visible)
                .stroke(gradient, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(-90))
            // Bright leading edge with a soft coloured halo.
            ZStack {
                Capsule().fill(color.opacity(0.45)).frame(width: 7, height: lineWidth + 10)
                Capsule().fill(Color.white).frame(width: 2, height: lineWidth + 4)
            }
            .offset(y: -105)
            .rotationEffect(.degrees(progress * 360))
            .opacity(progress > 0 ? 1 : 0)
        }
    }
}

// MARK: - Settings card

private struct SettingsCard: View {
    @EnvironmentObject private var timer: CountdownTimer

    var body: some View {
        VStack(spacing: 0) {
            if !timer.notificationsAllowed {
                SettingRow(icon: "bell.slash", title: "Notifications are off", iconColor: Theme.coral) {
                    Button("Turn On") { Notifier.openSettings() }
                        .buttonStyle(GlassChipStyle(isOn: true))
                        .help("Open System Settings → Notifications → Countdown and turn on Allow Notifications")
                }
                divider
            }

            SettingRow(icon: "tag", title: "Label") {
                if timer.state == .idle {
                    TextField("Add label", text: $timer.label)
                        .textFieldStyle(.plain)
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(.white.opacity(0.7))
                        .frame(maxWidth: 200)
                } else {
                    Text(timer.label.isEmpty ? "None" : timer.label)
                        .foregroundStyle(.white.opacity(0.4))
                        .lineLimit(1)
                }
            }

            divider
            ReminderSection()

            divider
            SoundRow()
        }
        .font(.system(size: 13))
        .glassPanel()
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(height: 1)
            .padding(.leading, 42)
    }
}

/// One settings row: thin icon, title, and a control on the right.
private struct SettingRow<Trailing: View>: View {
    let icon: String
    let title: String
    var iconColor: Color = .white.opacity(0.55)
    let trailing: Trailing

    init(icon: String, title: String, iconColor: Color = .white.opacity(0.55),
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
                .foregroundStyle(.white.opacity(0.9))
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 44)
    }
}

/// Reminder switch plus the "… minutes before the end" chips.
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
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.4))
                    .contentTransition(.numericText())
                    .animation(.snappy, value: summary)
                Toggle("Reminders", isOn: $timer.remindersEnabled)
                    .toggleStyle(GlowSwitchStyle())
                    .labelsHidden()
                    .help(timer.remindersEnabled ? "Turn reminders off" : "Turn reminders on")
            }

            FlowLayout(spacing: 6) {
                ForEach(options, id: \.self) { minutes in
                    let isOn = timer.isReminderOn(minutes)
                    Button("\(minutes)m") {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            timer.toggleReminder(minutes)
                        }
                    }
                    .buttonStyle(GlassChipStyle(isOn: isOn))
                    .help(isOn ? "Turn off the \(minutes)-minute reminder"
                               : "Remind me \(minutes) min before the end")
                }
                customChip
            }
            .disabled(!timer.remindersEnabled)
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
                    .foregroundStyle(.white.opacity(0.5))
            }
            .font(.system(size: 12, weight: .medium))
            .padding(.horizontal, 11)
            .frame(height: 26)
            .background(Capsule().fill(Color.white.opacity(0.08)))
            .overlay(Capsule().strokeBorder(
                LinearGradient(colors: Theme.iridescent, startPoint: .leading, endPoint: .trailing)))
            .shadow(color: Theme.cyan.opacity(0.4), radius: 6)
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
            .buttonStyle(GlassChipStyle())
            .help("Add a reminder at any number of minutes before the end")
        }
    }

    private var summary: String {
        let list = timer.reminderMinutes
        guard timer.remindersEnabled, !list.isEmpty else { return "Off" }
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
                .foregroundStyle(.white.opacity(0.6))
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
            .buttonStyle(GlassIconButtonStyle(size: 28))
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
