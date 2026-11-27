import Foundation
import Combine

/// All the timers, any number of which can run at once, plus which one the window shows.
final class TimerStore: ObservableObject {
    @Published private(set) var timers: [CountdownTimer]
    @Published var selectedID: UUID

    /// Re-publishes each timer's changes, so lists and the menu bar stay live.
    private var forwarding: [UUID: AnyCancellable] = [:]

    init() {
        let first = CountdownTimer()
        timers = [first]
        selectedID = first.id
        observe(first)
    }

    var selected: CountdownTimer {
        timers.first { $0.id == selectedID } ?? timers[0]
    }

    /// Adds a new timer and shows it.
    @discardableResult
    func add() -> CountdownTimer {
        let timer = CountdownTimer()
        timers.append(timer)
        observe(timer)
        selectedID = timer.id
        return timer
    }

    /// Removes a timer (stopping it). The last remaining timer is only reset.
    func remove(_ timer: CountdownTimer) {
        timer.reset()
        guard timers.count > 1, let index = timers.firstIndex(where: { $0 === timer }) else { return }
        timers.remove(at: index)
        forwarding[timer.id] = nil
        if selectedID == timer.id {
            selectedID = timers[min(index, timers.count - 1)].id
        }
    }

    /// The timer's label, or "Timer 2" etc. when it has none.
    func name(of timer: CountdownTimer) -> String {
        if !timer.label.isEmpty { return timer.label }
        let number = (timers.firstIndex { $0 === timer } ?? 0) + 1
        return "Timer \(number)"
    }

    /// The running timer that ends soonest (else a paused one), for the menu bar.
    var soonest: CountdownTimer? {
        timers.filter { $0.state == .running }.min { $0.remaining < $1.remaining }
            ?? timers.first { $0.state == .paused }
    }

    /// An idle timer to start from the menu bar, or a new one if all are busy.
    func idleOrNewTimer() -> CountdownTimer {
        if let idle = timers.first(where: { $0.state == .idle }) {
            selectedID = idle.id
            return idle
        }
        return add()
    }

    private func observe(_ timer: CountdownTimer) {
        forwarding[timer.id] = timer.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }
}
