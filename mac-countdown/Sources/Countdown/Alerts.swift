import AppKit
import UserNotifications
import os

private let log = Logger(subsystem: "com.cai112.countdown", category: "notifications")

/// Plays the alert sounds — built-in macOS sounds or spoken voice tones (see VoiceTones.swift):
/// the looping end-of-countdown alarm, the softer repeating reminder, and one-off previews.
final class AlarmPlayer {
    static let sounds = [
        "Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero",
        "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink",
    ]

    /// Stop by itself after this long if nobody dismisses the alert.
    private let maxRingTime: TimeInterval = 120
    /// Gap between reminder chimes while a reminder keeps ringing.
    private let reminderInterval: TimeInterval = 2.5

    private var sound: NSSound?
    private var reminderSound: NSSound?
    private var reminderTimer: Timer?
    private var reminderEnd: Date?
    /// Kept alive while a preview plays.
    private var oneShot: NSSound?

    private let alarmVoice = VoiceTonePlayer()
    private let reminderVoice = VoiceTonePlayer()
    private let previewVoice = VoiceTonePlayer()
    private var reminderVoiceRinging = false

    /// Called when a repeating reminder finishes by itself.
    var onReminderEnded: (() -> Void)?

    /// Built-in sounds plus the spoken voice tones.
    static var allSounds: [String] { sounds + VoiceTone.all.map(\.name) }

    /// A voice tone falls back to this if its recording is missing (e.g. under `swift run`).
    private static func systemSound(for name: String) -> String {
        VoiceTone.named(name) == nil ? name : "Glass"
    }

    // MARK: Alarm

    func start(named name: String) {
        stop()
        if let tone = VoiceTone.named(name),
           alarmVoice.play(tone, clip: .alarm, volume: 1, repeatUntil: Date().addingTimeInterval(maxRingTime)) {
            return
        }
        guard let sound = Self.makeSound(Self.systemSound(for: name)) else {
            NSSound.beep()
            return
        }
        sound.loops = true
        sound.play()
        self.sound = sound
        DispatchQueue.main.asyncAfter(deadline: .now() + maxRingTime) { [weak self, weak sound] in
            guard let self, let sound, self.sound === sound else { return }
            self.stop()
        }
    }

    func stop() {
        sound?.stop()
        sound = nil
        alarmVoice.stop()
    }

    // MARK: Reminder

    /// Soft reminder chime: once when `duration` is 0, otherwise repeating every few
    /// seconds for `duration` seconds (or until stopped).
    func startReminder(named name: String, duration: TimeInterval) {
        stopReminder(notify: false)
        if let tone = VoiceTone.named(name) {
            reminderVoice.onFinished = { [weak self] in self?.reminderVoiceFinished() }
            let until = duration > 0 ? Date().addingTimeInterval(duration) : nil
            if reminderVoice.play(tone, clip: .reminder, volume: 0.75, repeatUntil: until) {
                reminderVoiceRinging = duration > 0
                return
            }
        }
        guard let chime = Self.makeSound(Self.systemSound(for: name)) else {
            NSSound.beep()
            return
        }
        chime.volume = 0.55
        chime.play()
        reminderSound = chime
        guard duration > 0 else { return }

        reminderEnd = Date().addingTimeInterval(duration)
        let timer = Timer(timeInterval: reminderInterval, repeats: true) { [weak self] _ in
            self?.reminderTick()
        }
        RunLoop.main.add(timer, forMode: .common)
        reminderTimer = timer
    }

    func stopReminder(notify: Bool = true) {
        let wasRinging = reminderTimer != nil || reminderVoiceRinging
        reminderVoice.stop()
        reminderVoiceRinging = false
        reminderTimer?.invalidate()
        reminderTimer = nil
        reminderEnd = nil
        reminderSound?.stop()
        reminderSound = nil
        if notify && wasRinging { onReminderEnded?() }
    }

    private func reminderVoiceFinished() {
        guard reminderVoiceRinging else { return }
        reminderVoiceRinging = false
        onReminderEnded?()
    }

    private func reminderTick() {
        guard let end = reminderEnd, Date() < end else {
            stopReminder()
            return
        }
        reminderSound?.stop()
        reminderSound?.play()
    }

    // MARK: Preview

    func preview(named name: String) {
        oneShot?.stop()
        previewVoice.stop()
        if let tone = VoiceTone.named(name),
           previewVoice.play(tone, clip: .alarm, volume: 1, repeatUntil: nil) {
            return
        }
        oneShot = Self.makeSound(Self.systemSound(for: name))
        oneShot?.play()
    }

    /// `NSSound(named:)` returns a shared instance, so copy it to keep the
    /// alarm, reminder and previews independent.
    private static func makeSound(_ name: String) -> NSSound? {
        NSSound(named: NSSound.Name(name))?.copy() as? NSSound
    }
}

/// System notifications: "… minutes left" reminder pop-ups, and "Time's up!" for when a
/// countdown ends while the app is in the background. Each timer uses its own ids.
/// Notifications need a real app bundle, so this does nothing under `swift run`
/// (the in-app alert and sound still work).
enum Notifier {
    /// Posted on the main thread after the permission request has been answered.
    static let permissionAnswered = Notification.Name("CountdownNotificationPermissionAnswered")

    static func finishedID(_ timer: UUID) -> String {
        "countdown.\(timer.uuidString).finished"
    }

    static func warningID(_ timer: UUID, _ offset: TimeInterval) -> String {
        "countdown.\(timer.uuidString).warning.\(Int(offset))"
    }

    static func isWarning(_ id: String) -> Bool { id.contains(".warning.") }

    private static let presenter = NotificationPresenter()

    private static var isAvailable: Bool {
        Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app"
    }

    static func requestPermission() {
        guard isAvailable else { return }
        UNUserNotificationCenter.current().delegate = presenter
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            log.notice("Notification permission granted: \(granted, privacy: .public), error: \(String(describing: error), privacy: .public)")
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: permissionAnswered, object: nil)
            }
        }
    }

    /// `sound: false` for reminders: the app plays its own chime for those, so it is heard
    /// even when notifications are turned off.
    static func schedule(id: String, after interval: TimeInterval,
                         title: String, body: String, sound: Bool) {
        guard isAvailable, interval > 0 else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = sound ? .default : nil
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, interval), repeats: false)
        // Adding a request with the same id replaces any earlier one.
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        ) { error in
            if let error {
                log.error("Could not schedule \(id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            } else {
                log.notice("Scheduled \(id, privacy: .public) in \(Int(interval), privacy: .public)s")
            }
        }
    }

    /// Whether macOS currently lets Countdown show notifications.
    static func checkAllowed(_ completion: @escaping (Bool) -> Void) {
        guard isAvailable else { return completion(false) }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
            DispatchQueue.main.async { completion(allowed) }
        }
    }

    /// Opens Countdown's page in System Settings → Notifications.
    static func openSettings() {
        let id = Bundle.main.bundleIdentifier ?? ""
        let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)")
            ?? URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension")!
        NSWorkspace.shared.open(url)
    }

    /// Removes these pending and delivered notifications.
    static func cancel(ids: [String]) {
        guard isAvailable, !ids.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ids)
        center.removeDeliveredNotifications(withIdentifiers: ids)
    }

    /// Removes everything Countdown has scheduled (used when quitting).
    static func cancelAll() {
        guard isAvailable else { return }
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        center.removeAllDeliveredNotifications()
    }
}

/// Decides how notifications look while Countdown is the frontmost app.
final class NotificationPresenter: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // "Minutes left" pop-ups show even when Countdown is in front;
        // the final alert is the in-app "Time's up!" dialog instead.
        completionHandler(Notifier.isWarning(notification.request.identifier) ? [.banner, .list] : [])
    }
}
