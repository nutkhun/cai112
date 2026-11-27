import SwiftUI
import AppKit

@main
struct CountdownApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var timer = CountdownTimer()

    var body: some Scene {
        Window("Countdown", id: "main") {
            ContentView()
                .environmentObject(timer)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)

        // Remaining time stays visible in the menu bar, even when the window is closed.
        MenuBarExtra {
            MenuBarMenu()
                .environmentObject(timer)
        } label: {
            if timer.isActive {
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
}
