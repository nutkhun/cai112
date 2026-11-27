import Foundation
import AppKit
import Combine

/// One countdown. Several can run at once (see `TimerStore`); the sound and reminder
/// settings are shared (see `AppSettings`). Every method is called on the main thread
/// (UI actions and a main-run-loop timer).
final class CountdownTimer: ObservableObject, Identifiable {
    enum State { case idle, running, paused, finished }

    struct Preset {
        let title: String
        let short: String
        let seconds: Int
    }

    static let presets: [Preset] = [
        Preset(title: "1 min", short: "1m", seconds: 60),
        Preset(title: "5 min", short: "5m", seconds: 5 * 60),
        Preset(title: "10 min", short: "10m", seconds: 10 * 60),
        Preset(title: "15 min", short: "15m", seconds: 15 * 60),
        Preset(title: "25 min", short: "25m", seconds: 25 * 60),
        Preset(title: "1 hour", short: "1h", seconds: 60 * 60),
    ]

    let id = UUID()
    private let settings = AppSettings.shared

    // MARK: Duration being set up

    // Out-of-range values (e.g. typed into a field) are clamped; only reassign when needed.
    @Published var hours = 0 {
        didSet { let v = Self.clamp(hours, 0...99); if v != hours { hours = v } }
    }
    @Published var minutes = 5 {
        didSet { let v = Self.clamp(minutes, 0...59); if v != minutes { minutes = v } }
    }
    @Published var seconds = 0 {
        didSet { let v = Self.clamp(seconds, 0...59); if v != seconds { seconds = v } }
    }
    @Published var label = ""

    // MARK: Running countdown

    @Published private(set) var state: State = .idle
    @Published private(set) var remaining: TimeInterval = 0
    @Published private(set) var total: TimeInterval = 0
    @Published private(set) var endDate: Date?
    /// Reminders (minutes) that have already gone off in this countdown; shown as off.
    @Published private(set) var firedReminders: Set<Int> = []
    /// True while a reminder is chiming (it can be silenced).
    @Published private(set) var reminderRinging = false
    /// When time ran out (drives the black hole animation).
    @Published private(set) var finishedAt: Date?

    private var lastDuration: TimeInterval = 0
    /// Reminder times (seconds before the end) still to go off in this run.
    private var pendingReminders: [TimeInterval] = []
    /// Notification ids this timer has scheduled, so it can cancel just its own.
    private var scheduledNotifications: [String] = []
    private var remindersChanged: AnyCancellable?
    private var ticker: AnyCancellable?
    private var activity: NSObjectProtocol?
    private let alarm = AlarmPlayer()

    init() {
        alarm.onReminderEnded = { [weak self] in self?.reminderRinging = false }
        // Reschedule when the reminder settings change mid-countdown.
        remindersChanged = settings.remindersChanged.sink { [weak self] in
            guard let self, self.state == .running else { return }
            self.run()
        }
    }

    var configuredDuration: TimeInterval {
        TimeInterval(hours * 3600 + minutes * 60 + seconds)
    }

    var isActive: Bool { state == .running || state == .paused }

    /// Fraction of time left, 1 → 0.
    var progress: Double { total > 0 ? remaining / total : 0 }

    var remainingText: String { Self.format(remaining) }

    /// Exact time left at a moment, for smooth animation between ticks.
    func remaining(at date: Date) -> TimeInterval {
        guard state == .running, let end = endDate else { return remaining }
        return max(0, end.timeIntervalSince(date))
    }

    /// Fraction of time left at an exact moment.
    func progress(at date: Date) -> Double {
        total > 0 ? remaining(at: date) / total : 0
    }

    /// 0 → 1 over the few seconds after time runs out: the black hole swallowing the stars.
    func blackHoleProgress(at date: Date) -> Double {
        guard state == .finished, let finishedAt else { return 0 }
        return min(max(date.timeIntervalSince(finishedAt) / 3.5, 0), 1)
    }

    // MARK: Controls

    func start() {
        start(duration: configuredDuration)
    }

    func start(presetSeconds: Int) {
        hours = presetSeconds / 3600
        minutes = (presetSeconds % 3600) / 60
        seconds = presetSeconds % 60
        start()
    }

    func pause() {
        guard state == .running, let end = endDate else { return }
        remaining = max(0, end.timeIntervalSinceNow)
        stopTicking()
        silenceReminder()
        cancelNotifications()
        endDate = nil
        state = .paused
    }

    func resume() {
        guard state == .paused else { return }
        run()
    }

    func togglePause() {
        state == .running ? pause() : resume()
    }

    func reset() {
        stopTicking()
        alarm.stop()
        silenceReminder()
        cancelNotifications()
        state = .idle
        finishedAt = nil
        remaining = 0
        total = 0
        endDate = nil
        pendingReminders = []
        firedReminders = []
    }

    func addTime(_ extra: TimeInterval) {
        guard isActive else { return }
        total += extra
        remaining += extra
        if state == .running {
            // Re-anchor the end date and the scheduled notifications.
            run()
        }
    }

    /// Stops a reminder that is still chiming.
    func silenceReminder() {
        alarm.stopReminder(notify: false)
        reminderRinging = false
    }

    // MARK: Internals

    private func start(duration: TimeInterval) {
        guard duration > 0 else { return }
        alarm.stop()
        silenceReminder()
        lastDuration = duration
        total = duration
        remaining = duration
        firedReminders = []
        run()
    }

    private func run() {
        stopTicking()
        endDate = Date().addingTimeInterval(remaining)
        state = .running
        finishedAt = nil

        cancelNotifications()
        let finishedID = Notifier.finishedID(id)
        Notifier.schedule(id: finishedID, after: remaining,
                          title: finishedTitle, body: finishedMessage, sound: true)
        scheduledNotifications.append(finishedID)

        // "5 minutes left" etc. Only ones still ahead; one equal to the full duration would pop up at once.
        pendingReminders = settings.activeReminderMinutes
            .map { TimeInterval($0 * 60) }
            .filter { $0 < remaining - 0.5 }
        // Reminders that are ahead again (e.g. after +1 min) count as not yet fired.
        firedReminders.subtract(pendingReminders.map { Int($0 / 60) })
        for offset in pendingReminders {
            let warningID = Notifier.warningID(id, offset)
            Notifier.schedule(id: warningID, after: remaining - offset,
                              title: Self.timeLeftText(offset), body: warningBody, sound: false)
            scheduledNotifications.append(warningID)
        }

        // Keep App Nap from delaying the alert while the app is in the background.
        activity = ProcessInfo.processInfo.beginActivity(
            options: .userInitiatedAllowingIdleSystemSleep,
            reason: "Countdown running"
        )
        ticker = Timer.publish(every: 0.1, tolerance: 0.05, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.tick() }
    }

    private func tick() {
        guard state == .running, let end = endDate else { return }
        // Always computed from the end date, so it stays accurate after sleep or lag.
        remaining = max(0, end.timeIntervalSinceNow)
        if remaining <= 0 {
            finish()
            return
        }
        // Reminder chime, played by the app itself. After sleep several can be due at once: chime once.
        let due = pendingReminders.filter { remaining <= $0 }
        if !due.isEmpty {
            pendingReminders.removeAll { due.contains($0) }
            firedReminders.formUnion(due.map { Int($0 / 60) })
            let length = settings.reminderLength
            alarm.startReminder(named: settings.soundName, duration: length)
            reminderRinging = length > 0
        }
    }

    private func stopTicking() {
        ticker?.cancel()
        ticker = nil
        if let activity {
            ProcessInfo.processInfo.endActivity(activity)
            self.activity = nil
        }
    }

    private func cancelNotifications() {
        Notifier.cancel(ids: scheduledNotifications)
        scheduledNotifications = []
    }

    private func finish() {
        stopTicking()
        silenceReminder()
        remaining = 0
        endDate = nil
        state = .finished
        finishedAt = Date()
        pendingReminders = []
        alarm.start(named: settings.soundName)
        // Show the alert outside the timer callback.
        DispatchQueue.main.async { [weak self] in self?.presentAlert() }
    }

    private var finishedTitle: String {
        label.isEmpty ? "Time's up!" : "\(label): time's up!"
    }

    private var finishedMessage: String {
        let duration = Self.format(lastDuration)
        return label.isEmpty
            ? "Your \(duration) countdown has finished."
            : "\(label): your \(duration) countdown has finished."
    }

    private var warningBody: String {
        guard let end = endDate else { return "" }
        let time = end.formatted(date: .omitted, time: .shortened)
        return label.isEmpty ? "Countdown ends at \(time)." : "\(label) ends at \(time)."
    }

    static func timeLeftText(_ offset: TimeInterval) -> String {
        let minutes = Int(offset / 60)
        return minutes == 1 ? "1 minute left" : "\(minutes) minutes left"
    }

    private func presentAlert() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.requestUserAttention(.criticalRequest)

        let alert = NSAlert()
        alert.messageText = finishedTitle
        alert.informativeText = finishedMessage
        alert.alertStyle = .informational
        alert.icon = NSImage(systemSymbolName: "alarm.fill", accessibilityDescription: "Alarm")
        alert.addButton(withTitle: "Stop")
        alert.addButton(withTitle: "Snooze 1 min")
        alert.addButton(withTitle: "Restart")

        let response = alert.runModal()
        alarm.stop()
        cancelNotifications()

        // The user may have reset or restarted from the menu bar while the alert was open.
        guard state == .finished else { return }

        switch response {
        case .alertSecondButtonReturn:
            total = 60
            remaining = 60
            run()
        case .alertThirdButtonReturn:
            start(duration: lastDuration)
        default:
            reset()
        }
    }

    private static func clamp(_ value: Int, _ range: ClosedRange<Int>) -> Int {
        min(max(value, range.lowerBound), range.upperBound)
    }

    static func format(_ interval: TimeInterval) -> String {
        let totalSeconds = Int(interval.rounded(.up))
        let h = totalSeconds / 3600
        let m = (totalSeconds % 3600) / 60
        let s = totalSeconds % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%02d:%02d", m, s)
    }
}
