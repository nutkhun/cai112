import AppKit
import UserNotifications

/// Plays a built-in macOS sound on a loop until stopped.
final class AlarmPlayer {
    static let sounds = [
        "Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero",
        "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink",
    ]

    /// Stop by itself after this long if nobody dismisses the alert.
    private let maxRingTime: TimeInterval = 120
    private var sound: NSSound?
    /// Kept alive while a preview plays.
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
        oneShot?.stop()
        oneShot = Self.makeSound(name)
        oneShot?.play()
    }

    /// `NSSound(named:)` returns a shared instance, so copy it to keep the
    /// looping alarm and previews independent.
    private static func makeSound(_ name: String) -> NSSound? {
        NSSound(named: NSSound.Name(name))?.copy() as? NSSound
    }
}

/// System notifications: "5/2/1 minutes left" pop-ups, and "Time's up!" for when the
/// countdown ends while the app is in the background.
/// Notifications need a real app bundle, so this does nothing under `swift run`
/// (the in-app alert and sound still work).
enum Notifier {
    static let finishedID = "countdown.finished"
    static let warningPrefix = "countdown.warning."
    static func warningID(_ offset: TimeInterval) -> String { warningPrefix + String(Int(offset)) }

    private static var allIDs: [String] {
        [finishedID] + CountdownTimer.warningOffsets.map(warningID)
    }

    private static let presenter = NotificationPresenter()

    private static var isAvailable: Bool {
        Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app"
    }

    static func requestPermission() {
        guard isAvailable else { return }
        UNUserNotificationCenter.current().delegate = presenter
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    static func schedule(id: String, after interval: TimeInterval, title: String, body: String) {
        guard isAvailable, interval > 0 else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, interval), repeats: false)
        // Adding a request with the same id replaces any earlier one.
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        )
    }

    static func cancel() {
        guard isAvailable else { return }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: allIDs)
        center.removeDeliveredNotifications(withIdentifiers: allIDs)
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
        completionHandler(isWarning ? [.banner, .list, .sound] : [])
    }
}
