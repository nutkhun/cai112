import SwiftUI
import AppKit

@main
struct CountdownApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = TimerStore()
    @StateObject private var settings = AppSettings.shared

    var body: some Scene {
        Window("Countdown Timer", id: "main") {
            ContentView()
                .environmentObject(store)
                .environmentObject(settings)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)

        // The soonest-ending timer stays visible in the menu bar, even when the window is closed.
        MenuBarExtra {
            MenuBarMenu()
                .environmentObject(store)
        } label: {
            if let timer = store.soonest {
                Text(timer.remainingText)
            } else {
                Image(systemName: "timer")
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Needed so the app gets a Dock icon and focus when launched via `swift run`.
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        Notifier.requestPermission()
    }

    // Keep running (and counting down) from the menu bar after the window is closed.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    // Don't leave reminders or "time's up" notifications behind after quitting.
    func applicationWillTerminate(_ notification: Notification) {
        Notifier.cancelAll()
    }
}
