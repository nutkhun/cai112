import Foundation
import AppKit
import Combine

/// Holds all countdown state. Every method is called on the main thread
/// (UI actions and a main-run-loop timer).
final class CountdownTimer: ObservableObject {
    enum State { case idle, running, paused, finished }

    struct Preset {
        let title: String
        let seconds: Int
    }

    static let presets: [Preset] = [
        Preset(title: "1 min", seconds: 60),
        Preset(title: "5 min", seconds: 5 * 60),
        Preset(title: "10 min", seconds: 10 * 60),
        Preset(title: "15 min", seconds: 15 * 60),
        Preset(title: "25 min", seconds: 25 * 60),
        Preset(title: "1 hour", seconds: 60 * 60),
    ]

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
    @Published var soundName: String {
        didSet { UserDefaults.standard.set(soundName, forKey: Self.soundKey) }
    }

    // MARK: Running countdown

    @Published private(set) var state: State = .idle
    @Published private(set) var remaining: TimeInterval = 0
    @Published private(set) var total: TimeInterval = 0
    @Published private(set) var endDate: Date?

    private static let soundKey = "alertSound"
    private var lastDuration: TimeInterval = 0
    private var ticker: AnyCancellable?
    private var activity: NSObjectProtocol?
    private let alarm = AlarmPlayer()

    init() {
        let saved = UserDefaults.standard.string(forKey: Self.soundKey)
        soundName = saved.flatMap { AlarmPlayer.sounds.contains($0) ? $0 : nil } ?? "Glass"
    }

    var configuredDuration: TimeInterval {
        TimeInterval(hours * 3600 + minutes * 60 + seconds)
    }

    var isActive: Bool { state == .running || state == .paused }

    /// Fraction of time left, 1 → 0.
    var progress: Double { total > 0 ? remaining / total : 0 }

    var remainingText: String { Self.format(remaining) }

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
        Notifier.cancel()
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
        Notifier.cancel()
        state = .idle
        remaining = 0
        total = 0
        endDate = nil
    }

    func addTime(_ extra: TimeInterval) {
        guard isActive else { return }
        total += extra
        remaining += extra
        if state == .running {
            // Re-anchor the end date and the scheduled notification.
            run()
        }
    }

    func previewSound() {
        alarm.preview(named: soundName)
    }

    // MARK: Internals

    private func start(duration: TimeInterval) {
        guard duration > 0 else { return }
        alarm.stop()
        lastDuration = duration
        total = duration
        remaining = duration
        run()
    }

    private func run() {
        stopTicking()
        endDate = Date().addingTimeInterval(remaining)
        state = .running
        Notifier.schedule(after: remaining, body: finishedMessage)

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
        if remaining <= 0 { finish() }
    }

    private func stopTicking() {
        ticker?.cancel()
        ticker = nil
        if let activity {
            ProcessInfo.processInfo.endActivity(activity)
            self.activity = nil
        }
    }

    private func finish() {
        stopTicking()
        remaining = 0
        endDate = nil
        state = .finished
        alarm.start(named: soundName)
        // Show the alert outside the timer callback.
        DispatchQueue.main.async { [weak self] in self?.presentAlert() }
    }

    private var finishedMessage: String {
        let duration = Self.format(lastDuration)
        return label.isEmpty
            ? "Your \(duration) countdown has finished."
            : "\(label): your \(duration) countdown has finished."
    }

    private func presentAlert() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.requestUserAttention(.criticalRequest)

        let alert = NSAlert()
        alert.messageText = "Time's up!"
        alert.informativeText = finishedMessage
        alert.alertStyle = .informational
        alert.icon = NSImage(systemSymbolName: "alarm.fill", accessibilityDescription: "Alarm")
        alert.addButton(withTitle: "Stop")
        alert.addButton(withTitle: "Snooze 1 min")
        alert.addButton(withTitle: "Restart")

        let response = alert.runModal()
        alarm.stop()
        Notifier.cancel()

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
