import AppKit
import UserNotifications
import os

private let log = Logger(subsystem: "com.cai112.countdown", category: "notifications")

/// Plays a built-in macOS sound on a loop until stopped.
final class AlarmPlayer {
    static let sounds = [
        "Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero",
        "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink",
    ]

    /// Stop by itself after this long if nobody dismisses the alert.
    private let maxRingTime: TimeInterval = 120
    private var sound: NSSound?
    /// Kept alive while a preview or reminder chime plays.
    private var oneShot: NSSound?

    func start(named name: String) {
        stop()
        guard let sound = Self.makeSound(name) else {
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
    }

    func preview(named name: String) {
        playOnce(name)
    }

    /// Plays the chosen sound once, a little softer, for the reminders before the end.
    func chime(named name: String) {
        playOnce(name, volume: 0.6)
    }

    private func playOnce(_ name: String, volume: Float = 1) {
        oneShot?.stop()
        oneShot = Self.makeSound(name)
        oneShot?.volume = volume
        oneShot?.play()
    }

    /// `NSSound(named:)` returns a shared instance, so copy it to keep the
    /// looping alarm and previews independent.
    private static func makeSound(_ name: String) -> NSSound? {
        NSSound(named: NSSound.Name(name))?.copy() as? NSSound
    }
}

/// System notifications: "… minutes left" reminder pop-ups, and "Time's up!" for when the
/// countdown ends while the app is in the background.
/// Notifications need a real app bundle, so this does nothing under `swift run`
/// (the in-app alert and sound still work).
enum Notifier {
    /// Posted on the main thread after the permission request has been answered.
    static let permissionAnswered = Notification.Name("CountdownNotificationPermissionAnswered")

    static let finishedID = "countdown.finished"
    static let warningPrefix = "countdown.warning."
    static func warningID(_ offset: TimeInterval) -> String { warningPrefix + String(Int(offset)) }

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

    static func cancel() {
        guard isAvailable else { return }
        // Countdown posts no other notifications, so clear them all (this also
        // catches reminders for minute values the user has since turned off).
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
        let isWarning = notification.request.identifier.hasPrefix(Notifier.warningPrefix)
        completionHandler(isWarning ? [.banner, .list] : [])
    }
}
