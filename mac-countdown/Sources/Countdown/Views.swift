import SwiftUI
import AppKit

struct ContentView: View {
    @EnvironmentObject private var store: TimerStore
    @State private var windowVisible = true

    var body: some View {
        let timer = store.selected
        VStack(spacing: 12) {
            TimerTabs()

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
            // A fresh view per timer, cross-fading when you switch tabs.
            .id(timer.id)
            .transition(.opacity.combined(with: .scale(scale: 0.96)))
            // Same height in both states, so the window doesn't jump.
            .frame(height: 392)
            .animation(.spring(response: 0.6, dampingFraction: 0.8), value: timer.state == .idle)

            SettingsCard()

            PoweredByBadge()
                .padding(.top, 2)
        }
        // Everything below the tabs works on the selected timer.
        .environmentObject(timer)
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 20)
        .frame(width: 400)
        // App icon and name in the title-bar strip, level with the window buttons.
        .overlay(alignment: .top) {
            AppHeader()
                .padding(.top, 9)
                .ignoresSafeArea(edges: .top)
        }
        .foregroundStyle(.white)
        // Stars streaming past, faster as time runs out; a black hole swallows them at the end.
        .backgroundPreferenceValue(DialCenterKey.self) { anchor in
            GeometryReader { proxy in
                StarfieldView(timer: timer,
                              center: anchor.map { proxy[$0] }
                                  ?? CGPoint(x: proxy.size.width / 2, y: proxy.size.height * 0.38))
            }
            .ignoresSafeArea()
        }
        .background(SpaceBackground())
        .background(WindowVisibilityReader(isVisible: $windowVisible))
        .environment(\.animationsPaused, !windowVisible)
        .preferredColorScheme(.dark)
    }
}

/// The app icon with the app name.
private struct AppHeader: View {
    var body: some View {
        HStack(spacing: 7) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .interpolation(.high)
                .frame(width: 24, height: 24)
            Text("Blackhole Timer")
                .font(.system(size: 15, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.85))
        }
        // Let clicks fall through, so the window can still be dragged from here.
        .allowsHitTesting(false)
    }
}

// MARK: - Setting the time

private struct SetupView: View {
    @EnvironmentObject private var timer: CountdownTimer
    @Environment(\.animationsPaused) private var animationsPaused

    var body: some View {
        ZStack {
            // A soft aurora drifting behind the digits (no ribbon lines over the controls).
            TimelineView(.animation(minimumInterval: 1.0 / 24, paused: animationsPaused)) { context in
                OrbView(time: context.date.timeIntervalSinceReferenceDate,
                        palette: Theme.calm, energy: 0.1, intensity: 0.75, ribbonStrength: 0)
            }
            .frame(width: 380, height: 380)
            .offset(y: -36)
            .allowsHitTesting(false)

            VStack(spacing: 22) {
                Text("SET TIMER")
                    .font(.system(size: 12, weight: .semibold))
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
                .shadow(color: Theme.gold.opacity(hovering ? 0.25 : 0), radius: 10)
            stepButton("chevron.down") {
                value = value <= range.lowerBound ? range.upperBound : value - 1
            }
            Text(unit.uppercased())
                .font(.system(size: 11, weight: .semibold))
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
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.animationsPaused) private var animationsPaused
    @State private var clock = AnimationClock()

    var body: some View {
        VStack(spacing: 14) {
            // Redraws ~24× a second: the corona breathes, the aura spreads, the rim drains smoothly.
            TimelineView(.animation(minimumInterval: 1.0 / 24, paused: animationsPaused || timer.state == .idle)) { context in
                dial(at: context.date)
            }
            controls
        }
        // A reminder that is still chiming can be silenced.
        .overlay(alignment: .top) {
            if timer.reminderRinging {
                Button {
                    timer.silenceReminder()
                } label: {
                    Label("Silence reminder", systemImage: "bell.slash.fill")
                }
                .buttonStyle(GlassChipStyle(isOn: true))
                .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: timer.reminderRinging)
    }

    // MARK: Dial

    private func dial(at date: Date) -> some View {
        let t = date.timeIntervalSinceReferenceDate
        let breath = (sin(t * 2.4) + 1) / 2  // 0…1
        let finished = timer.state == .finished
        let live = timer.remaining(at: date)
        let progress = finished ? 1 : (timer.total > 0 ? live / timer.total : 0)
        let dim = timer.state == .paused ? 0.35 + 0.35 * breath : 1
        clock.advance(to: t, waveSpeed: 0.1 + 0.3 * energy, breathSpeed: 0.8 + 1.5 * energy)

        return ZStack {
            // The eclipse; its bright rim is the time remaining. Drawn larger than the dial
            // so the corona and spreading aura can fade out freely.
            EclipseView(time: t, wavePhase: clock.wavePhase, breathPhase: clock.breathPhase,
                        progress: progress, palette: palette(elapsed: finished ? 1 : 1 - progress),
                        intensity: dim * (1 - 0.8 * timer.blackHoleProgress(at: date)))
                .frame(width: 380, height: 380)
                .allowsHitTesting(false)

            // Small marker at 12 o'clock, where the rim starts and ends.
            Image(systemName: "arrowtriangle.down.fill")
                .font(.system(size: 6))
                .foregroundStyle(.white.opacity(0.6))
                .offset(y: -82)

            ForEach(reminderMarks, id: \.minutes) { mark in
                reminderLabel(mark, progress: progress)
            }

            center(live: live)
                .opacity(timer.state == .paused ? 0.45 + 0.55 * breath : 1)
        }
        .frame(width: 300, height: 300)
        // Tells the starfield where the dial is (the stars stream from, and fall into, its centre).
        .anchorPreference(key: DialCenterKey.self, value: .center) { $0 }
    }

    private struct ReminderMark {
        let minutes: Int
        let fraction: Double
    }

    /// Reminder times that fall inside this countdown, placed around the ring.
    private var reminderMarks: [ReminderMark] {
        guard timer.total > 0 else { return [] }
        return settings.activeReminderMinutes
            .map { ReminderMark(minutes: $0, fraction: Double($0 * 60) / timer.total) }
            .filter { $0.fraction > 0 && $0.fraction < 1 }
    }

    private func reminderLabel(_ mark: ReminderMark, progress: Double) -> some View {
        let angle = mark.fraction * 2 * .pi
        let upcoming = mark.fraction < progress
        return ZStack {
            // Dot on the rim…
            Circle()
                .fill(upcoming ? Color.white : Color.white.opacity(0.25))
                .frame(width: 4, height: 4)
                .offset(x: sin(angle) * 91, y: -cos(angle) * 91)
            // …and its label outside it.
            Text("\(mark.minutes)m")
                .font(.system(size: 11, weight: .medium).monospacedDigit())
                .foregroundStyle(.white.opacity(upcoming ? 0.85 : 0.3))
                .shadow(color: .black.opacity(0.8), radius: 2)
                .offset(x: sin(angle) * 118, y: -cos(angle) * 118)
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
                    .font(.system(size: 13, weight: .semibold))
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
                    .font(.system(size: 11, weight: .semibold))
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
                .font(.system(size: 12, weight: .medium))
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
            .buttonStyle(GlassOrbButtonStyle(tint: palette(elapsed: timer.state == .finished ? 1 : 1 - timer.progress).warm))
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

    // MARK: Colour temperature and motion

    /// Breathing and spreading waves speed up gradually as the countdown runs out.
    private var energy: Double {
        switch timer.state {
        case .paused: return 0
        case .finished: return 1.3
        default:
            let elapsed = 1 - timer.progress
            return 0.25 + 0.85 * elapsed * elapsed
        }
    }

    /// Colours follow the countdown continuously: cool at the start, red when time is up.
    /// Paused fades them toward grey. The play/pause button uses the corona colour.
    private func palette(elapsed: Double) -> EclipseView.Palette {
        ColorTemperature.palette(elapsed: elapsed, desaturate: timer.state == .paused ? 0.75 : 0)
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

// MARK: - Settings card

private struct SettingsCard: View {
    @EnvironmentObject private var timer: CountdownTimer
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        VStack(spacing: 0) {
            if !settings.notificationsAllowed {
                SettingRow(icon: "bell.slash", title: "Notifications are off", tint: Theme.coral) {
                    Button("Turn On") { Notifier.openSettings() }
                        .buttonStyle(GlassChipStyle(isOn: true))
                        .help("Open System Settings → Notifications → Blackhole Timer and turn on Allow Notifications")
                }
                divider
            }

            SettingRow(icon: "tag", title: "Label") {
                if timer.state == .idle {
                    TextField("Add label", text: $timer.label)
                        .textFieldStyle(.plain)
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(.white.opacity(0.75))
                        .frame(maxWidth: 190)
                } else {
                    Text(timer.label.isEmpty ? "None" : timer.label)
                        .foregroundStyle(.white.opacity(0.45))
                        .lineLimit(1)
                }
            }

            divider
            ReminderSection()

            divider
            SoundRow()
        }
        .font(.system(size: 15))
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(red: 0.05, green: 0.06, blue: 0.11).opacity(0.8))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.14), .white.opacity(0.03)],
                                             startPoint: .top, endPoint: .bottom))
        )
        .shadow(color: .black.opacity(0.35), radius: 18, y: 8)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(height: 1)
            .padding(.leading, 60)
    }
}

/// One settings row: icon in a small rounded tile, title, and a control on the right.
private struct SettingRow<Trailing: View>: View {
    let icon: String
    let title: String
    var tint: Color = .white.opacity(0.8)
    let trailing: Trailing

    init(icon: String, title: String, tint: Color = .white.opacity(0.8),
         @ViewBuilder trailing: () -> Trailing) {
        self.icon = icon
        self.title = title
        self.tint = tint
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.white.opacity(0.07)))
            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.95))
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 54)
    }
}

/// A menu shown as its current value with a small up/down chevron.
private struct MenuValueLabel: View {
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            Text(text)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 10, weight: .semibold))
        }
        .foregroundStyle(.white.opacity(0.65))
    }
}

/// Reminder switch, the "… minutes before the end" chips, and how long a reminder rings.
private struct ReminderSection: View {
    @EnvironmentObject private var timer: CountdownTimer
    @EnvironmentObject private var settings: AppSettings
    @State private var customMinutes: Int?
    @State private var addingCustom = false
    @FocusState private var customFocused: Bool

    /// The standard choices plus any custom values the user added.
    private var options: [Int] {
        Set(AppSettings.reminderChoices + settings.reminderMinutes).sorted()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SettingRow(icon: "bell", title: "Reminders") {
                Text(summary)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.45))
                    .contentTransition(.numericText())
                    .animation(.snappy, value: summary)
                Toggle("Reminders", isOn: $settings.remindersEnabled)
                    .toggleStyle(GlowSwitchStyle())
                    .labelsHidden()
                    .help(settings.remindersEnabled ? "Turn reminders off" : "Turn reminders on")
            }

            VStack(alignment: .leading, spacing: 12) {
                FlowLayout(spacing: 8) {
                    ForEach(options, id: \.self) { minutes in
                        let isOn = settings.isReminderOn(minutes)
                        let fired = timer.firedReminders.contains(minutes)
                        Button {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                settings.toggleReminder(minutes)
                            }
                        } label: {
                            HStack(spacing: 4) {
                                if fired {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 10, weight: .bold))
                                }
                                Text("\(minutes)m")
                            }
                        }
                        // A reminder that has already gone off shows as off until the next countdown.
                        .buttonStyle(GlassChipStyle(isOn: isOn && !fired))
                        .help(fired ? "Already reminded in this countdown"
                              : isOn ? "Turn off the \(minutes)-minute reminder"
                                     : "Remind me \(minutes) min before the end")
                    }
                    customChip
                }

                // How long each reminder keeps ringing.
                HStack(spacing: 6) {
                    Image(systemName: "waveform")
                        .font(.system(size: 12, weight: .semibold))
                    Text("Rings for")
                    Menu {
                        Picker("Rings for", selection: $settings.reminderLength) {
                            ForEach(AppSettings.reminderLengths) { length in
                                Text(length.title).tag(length.seconds)
                            }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    } label: {
                        MenuValueLabel(text: settings.reminderLengthTitle)
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .fixedSize()
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.5))
                .help("How long a reminder keeps ringing")
            }
            .disabled(!settings.remindersEnabled)
            .opacity(settings.remindersEnabled ? 1 : 0.6)
            .padding(.leading, 60)
            .padding(.trailing, 16)
            .padding(.bottom, 16)
        }
    }

    /// "+ Custom" chip that turns into a small number field.
    @ViewBuilder private var customChip: some View {
        if addingCustom {
            HStack(spacing: 2) {
                TextField("0", value: $customMinutes, format: .number)
                    .textFieldStyle(.plain)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 32)
                    .focused($customFocused)
                    .onSubmit(addCustom)
                    .onExitCommand { closeCustom() }
                Text("m")
                    .foregroundStyle(.white.opacity(0.5))
            }
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 14)
            .frame(height: 32)
            .background(Capsule().fill(Color.white.opacity(0.1)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.5)))
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
        let list = settings.reminderMinutes
        guard settings.remindersEnabled, !list.isEmpty else { return "Off" }
        return list.map(String.init).joined(separator: ", ") + " min before"
    }

    private func addCustom() {
        if let minutes = customMinutes {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                settings.addReminder(minutes)
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
    @EnvironmentObject private var settings: AppSettings
    @State private var previews = 0

    var body: some View {
        SettingRow(icon: "speaker.wave.2", title: "Sound") {
            Menu {
                Picker("Sound", selection: $settings.soundName) {
                    Section("Spooky voices") {
                        ForEach(VoiceTone.all, id: \.name) { tone in
                            Text(tone.name).tag(tone.name)
                        }
                    }
                    Section("Sounds") {
                        ForEach(AlarmPlayer.sounds, id: \.self) { Text($0).tag($0) }
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } label: {
                MenuValueLabel(text: settings.soundName)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()

            Button {
                previews += 1
                settings.previewSound()
            } label: {
                Image(systemName: "play.fill")
                    .symbolEffect(.bounce, value: previews)
            }
            .buttonStyle(GlassIconButtonStyle(size: 32))
            .help("Play this sound")
        }
    }
}

// MARK: - Timer tabs

/// One tab per timer (label, live time, status) plus a + to add another.
private struct TimerTabs: View {
    @EnvironmentObject private var store: TimerStore

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(store.timers) { timer in
                    TimerTab(timer: timer,
                             name: store.name(of: timer),
                             isSelected: timer.id == store.selectedID,
                             canRemove: store.timers.count > 1,
                             select: {
                                 withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                                     store.selectedID = timer.id
                                 }
                             },
                             remove: {
                                 withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                     store.remove(timer)
                                 }
                             })
                    .transition(.scale.combined(with: .opacity))
                }

                Button {
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { _ = store.add() }
                } label: {
                    Image(systemName: "plus")
                }
                .buttonStyle(GlassIconButtonStyle(size: 28))
                .keyboardShortcut("t", modifiers: .command)
                .help("Add another timer (⌘T)")
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 4)
        }
        .frame(height: 36)
    }
}

private struct TimerTab: View {
    @ObservedObject var timer: CountdownTimer
    let name: String
    let isSelected: Bool
    let canRemove: Bool
    let select: () -> Void
    let remove: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(dotColor)
                .frame(width: 6, height: 6)
                .shadow(color: dotColor.opacity(timer.state == .running ? 0.9 : 0), radius: 3)
            Text(name)
                .lineLimit(1)
                .frame(maxWidth: 90)
            if timer.state != .idle {
                Text(timer.remainingText)
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.55))
            }
            if timer.reminderRinging {
                Image(systemName: "bell.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.gold)
                    .symbolEffect(.pulse)
            }
            if canRemove && hovering {
                Button(action: remove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 8, weight: .bold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white.opacity(0.6))
                .help("Remove this timer")
            }
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundStyle(.white.opacity(isSelected ? 1 : 0.7))
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(Capsule().fill(Color.white.opacity(isSelected ? 0.12 : (hovering ? 0.07 : 0.04))))
        .overlay(Capsule().strokeBorder(border, lineWidth: isSelected ? 1.2 : 1))
        .contentShape(Capsule())
        .onTapGesture(perform: select)
        .onHover { hovering = $0 }
        .contextMenu {
            if canRemove {
                Button("Remove Timer", role: .destructive, action: remove)
            }
        }
        .animation(.easeOut(duration: 0.15), value: hovering)
        .animation(.easeInOut(duration: 0.2), value: isSelected)
    }

    private var dotColor: Color {
        switch timer.state {
        case .running: return Theme.gold
        case .paused: return Color(white: 0.6)
        case .finished: return .red
        case .idle: return Color.white.opacity(0.25)
        }
    }

    private var border: AnyShapeStyle {
        isSelected
            ? AnyShapeStyle(LinearGradient(colors: Theme.iridescent, startPoint: .leading, endPoint: .trailing))
            : AnyShapeStyle(Color.white.opacity(0.08))
    }
}

// MARK: - Menu bar

struct MenuBarMenu: View {
    @EnvironmentObject private var store: TimerStore
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        ForEach(store.timers) { timer in
            MenuBarTimerItem(timer: timer, name: store.name(of: timer))
        }

        Divider()

        Menu("Start New Timer") {
            ForEach(CountdownTimer.presets, id: \.seconds) { preset in
                Button(preset.title) {
                    store.idleOrNewTimer().start(presetSeconds: preset.seconds)
                }
            }
        }

        Divider()

        Button("Show Window") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }
        Button("Quit Blackhole Timer") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}

/// One timer in the menu bar menu, with its own actions.
private struct MenuBarTimerItem: View {
    @ObservedObject var timer: CountdownTimer
    let name: String

    var body: some View {
        switch timer.state {
        case .running:
            Menu("\(name) — \(timer.remainingText)") {
                Button("Pause") { timer.pause() }
                Button("Add 1 Minute") { timer.addTime(60) }
                if timer.reminderRinging {
                    Button("Silence Reminder") { timer.silenceReminder() }
                }
                Button("Reset") { timer.reset() }
            }
        case .paused:
            Menu("\(name) — paused at \(timer.remainingText)") {
                Button("Resume") { timer.resume() }
                Button("Add 1 Minute") { timer.addTime(60) }
                Button("Reset") { timer.reset() }
            }
        case .idle, .finished:
            Menu(name) {
                ForEach(CountdownTimer.presets, id: \.seconds) { preset in
                    Button("Start \(preset.title)") { timer.start(presetSeconds: preset.seconds) }
                }
            }
        }
    }
}
