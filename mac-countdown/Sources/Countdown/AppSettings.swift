import Foundation
import AppKit
import Combine

/// Settings shared by every timer: alert sound, reminders and notification permission.
/// Saved in UserDefaults. Used on the main thread only.
final class AppSettings: ObservableObject {
    static let shared = AppSettings()

    struct ReminderLength: Identifiable, Hashable {
        let seconds: TimeInterval
        let title: String
        var id: TimeInterval { seconds }
    }

    /// How long a reminder keeps chiming softly.
    static let reminderLengths: [ReminderLength] = [
        ReminderLength(seconds: 0, title: "Once"),
        ReminderLength(seconds: 10, title: "10 sec"),
        ReminderLength(seconds: 30, title: "30 sec"),
        ReminderLength(seconds: 60, title: "1 min"),
        ReminderLength(seconds: 180, title: "3 min"),
    ]

    /// Reminder times offered as chips; any other number can be added too.
    static let reminderChoices = [1, 2, 3, 5, 10, 15, 30]
    static let maxReminderMinutes = 999

    @Published var soundName: String {
        didSet { defaults.set(soundName, forKey: Keys.sound) }
    }
    /// Master switch for the reminders.
    @Published var remindersEnabled: Bool {
        didSet {
            defaults.set(remindersEnabled, forKey: Keys.remindersEnabled)
            remindersChanged.send()
        }
    }
    /// Minutes before the end at which a "… minutes left" reminder goes off.
    @Published private(set) var reminderMinutes: [Int] {
        didSet {
            defaults.set(reminderMinutes, forKey: Keys.reminders)
            remindersChanged.send()
        }
    }
    /// Seconds a reminder keeps chiming (0 = a single chime).
    @Published var reminderLength: TimeInterval {
        didSet { defaults.set(reminderLength, forKey: Keys.reminderLength) }
    }
    /// False when notifications are turned off for Countdown in System Settings.
    @Published private(set) var notificationsAllowed = true

    /// Fires when the reminder schedule changes, so running timers can reschedule.
    let remindersChanged = PassthroughSubject<Void, Never>()

    private enum Keys {
        static let sound = "alertSound"
        static let reminders = "reminderMinutes"
        static let remindersEnabled = "remindersEnabled"
        static let reminderLength = "reminderLength"
    }

    private let defaults = UserDefaults.standard
    private let previewPlayer = AlarmPlayer()
    private var becameActive: AnyCancellable?

    private init() {
        let saved = defaults.string(forKey: Keys.sound)
        soundName = saved.flatMap { AlarmPlayer.allSounds.contains($0) ? $0 : nil } ?? "Glass"
        reminderMinutes = defaults.array(forKey: Keys.reminders) as? [Int] ?? [5, 2, 1]
        remindersEnabled = defaults.object(forKey: Keys.remindersEnabled) as? Bool ?? true
        reminderLength = defaults.object(forKey: Keys.reminderLength) as? TimeInterval ?? 180

        // Re-check whenever the app comes to the front, e.g. after visiting System Settings.
        becameActive = NotificationCenter.default
            .publisher(for: NSApplication.didBecomeActiveNotification)
            .merge(with: NotificationCenter.default.publisher(for: Notifier.permissionAnswered))
            .sink { [weak self] _ in self?.refreshNotificationStatus() }
    }

    func refreshNotificationStatus() {
        Notifier.checkAllowed { [weak self] allowed in self?.notificationsAllowed = allowed }
    }

    /// Reminders that are actually in use (none when the switch is off).
    var activeReminderMinutes: [Int] { remindersEnabled ? reminderMinutes : [] }

    var reminderLengthTitle: String {
        Self.reminderLengths.first { $0.seconds == reminderLength }?.title ?? "\(Int(reminderLength)) sec"
    }

    func isReminderOn(_ minutes: Int) -> Bool {
        reminderMinutes.contains(minutes)
    }

    func toggleReminder(_ minutes: Int) {
        if isReminderOn(minutes) {
            reminderMinutes.removeAll { $0 == minutes }
        } else {
            addReminder(minutes)
        }
    }

    func addReminder(_ minutes: Int) {
        guard (1...Self.maxReminderMinutes).contains(minutes), !isReminderOn(minutes) else { return }
        reminderMinutes = (reminderMinutes + [minutes]).sorted(by: >)
    }

    func previewSound() {
        previewPlayer.preview(named: soundName)
    }
}
