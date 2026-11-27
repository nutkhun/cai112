import AVFoundation

/// A spoken "weird" alert tone: a phrase recorded with a macOS voice (by scripts/make-voices.sh
/// into the app's Resources) and played back through pitch, distortion, echo and reverb.
struct VoiceTone {
    enum Clip: String {
        /// "Your time is over" — the end-of-countdown alarm.
        case alarm
        /// "Your time is running out" — the reminders before the end.
        case reminder
    }

    struct Echo {
        let delay: TimeInterval
        /// Percent of the echo fed back (more = longer trail).
        let feedback: Float
        let mix: Float
    }

    /// Shown in the Sound menu.
    let name: String
    /// Resources/<stem>-alarm.aiff and <stem>-reminder.aiff.
    let fileStem: String
    /// Pitch shift in cents for each layer; the layers play together (two = a doubled voice).
    let layers: [Float]
    /// Playback speed (below 1 is slower and more drawn out).
    let rate: Float
    let distortion: AVAudioUnitDistortionPreset?
    let distortionMix: Float
    let echo: Echo?
    let reverb: AVAudioUnitReverbPreset
    let reverbMix: Float

    static let all: [VoiceTone] = [
        VoiceTone(name: "Demon", fileStem: "demon", layers: [-900, -500], rate: 0.85,
                  distortion: .multiDistortedSquared, distortionMix: 14,
                  echo: nil, reverb: .cathedral, reverbMix: 45),
        // Two slightly detuned whispers: louder, with an eerie chorus.
        VoiceTone(name: "Ghost", fileStem: "ghost", layers: [-250, -230], rate: 0.9,
                  distortion: nil, distortionMix: 0,
                  echo: Echo(delay: 0.38, feedback: 50, mix: 30), reverb: .largeHall2, reverbMix: 40),
        VoiceTone(name: "Robot", fileStem: "robot", layers: [-100], rate: 1.0,
                  distortion: .speechRadioTower, distortionMix: 35,
                  echo: nil, reverb: .smallRoom, reverbMix: 12),
        VoiceTone(name: "Doom Organ", fileStem: "organ", layers: [-300], rate: 0.9,
                  distortion: nil, distortionMix: 0,
                  echo: nil, reverb: .cathedral, reverbMix: 50),
        VoiceTone(name: "Alien", fileStem: "alien", layers: [200, -400], rate: 0.95,
                  distortion: .speechAlienChatter, distortionMix: 40,
                  echo: Echo(delay: 0.18, feedback: 35, mix: 25), reverb: .mediumHall, reverbMix: 30),
    ]

    static func named(_ name: String) -> VoiceTone? {
        all.first { $0.name == name }
    }

    func url(for clip: Clip) -> URL? {
        Bundle.main.url(forResource: "\(fileStem)-\(clip.rawValue)", withExtension: "aiff")
    }
}

/// Plays a `VoiceTone` through its effects, once or repeatedly until a deadline.
/// Used on the main thread.
final class VoiceTonePlayer {
    /// Pause between repeats, which also lets the reverb ring out.
    private let gap: TimeInterval = 1.0

    private var engine: AVAudioEngine?
    private var players: [AVAudioPlayerNode] = []
    private var file: AVAudioFile?
    private var repeatUntil: Date?
    /// Bumped on every play/stop, so callbacks from an earlier playback are ignored.
    private var generation = 0

    /// Called when playback ends by itself (not when `stop()` is called).
    var onFinished: (() -> Void)?

    var isPlaying: Bool { engine != nil }

    /// Plays once (`repeatUntil` nil) or again and again until `repeatUntil`.
    /// Returns false if the recording is missing (e.g. under `swift run`) or audio failed.
    @discardableResult
    func play(_ tone: VoiceTone, clip: VoiceTone.Clip, volume: Float, repeatUntil: Date?) -> Bool {
        stop()
        guard let url = tone.url(for: clip), let file = try? AVAudioFile(forReading: url) else { return false }

        let engine = AVAudioEngine()
        let format = file.processingFormat
        let submix = AVAudioMixerNode()
        engine.attach(submix)

        var players: [AVAudioPlayerNode] = []
        for cents in tone.layers {
            let player = AVAudioPlayerNode()
            let pitch = AVAudioUnitTimePitch()
            pitch.pitch = cents
            pitch.rate = tone.rate
            engine.attach(player)
            engine.attach(pitch)
            engine.connect(player, to: pitch, format: format)
            engine.connect(pitch, to: submix, fromBus: 0, toBus: submix.nextAvailableInputBus, format: format)
            players.append(player)
        }

        // The recordings are mono; the effects need stereo, so the mixer converts here.
        let stereo = AVAudioFormat(standardFormatWithSampleRate: format.sampleRate, channels: 2) ?? format
        var last: AVAudioNode = submix
        if let preset = tone.distortion {
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(preset)
            distortion.wetDryMix = tone.distortionMix
            engine.attach(distortion)
            engine.connect(last, to: distortion, format: stereo)
            last = distortion
        }
        if let echo = tone.echo {
            let delay = AVAudioUnitDelay()
            delay.delayTime = echo.delay
            delay.feedback = echo.feedback
            delay.wetDryMix = echo.mix
            delay.lowPassCutoff = 5000
            engine.attach(delay)
            engine.connect(last, to: delay, format: stereo)
            last = delay
        }
        let reverb = AVAudioUnitReverb()
        reverb.loadFactoryPreset(tone.reverb)
        reverb.wetDryMix = tone.reverbMix
        engine.attach(reverb)
        engine.connect(last, to: reverb, format: stereo)
        engine.connect(reverb, to: engine.mainMixerNode, format: stereo)
        engine.mainMixerNode.outputVolume = volume

        do {
            try engine.start()
        } catch {
            return false
        }

        self.engine = engine
        self.players = players
        self.file = file
        self.repeatUntil = repeatUntil
        generation += 1
        schedule(generation)
        return true
    }

    func stop() {
        generation += 1
        players.forEach { $0.stop() }
        engine?.stop()
        engine = nil
        players = []
        file = nil
        repeatUntil = nil
    }

    private func schedule(_ playback: Int) {
        guard playback == generation, let file else { return }
        for (index, player) in players.enumerated() {
            player.scheduleFile(file, at: nil, completionCallbackType: .dataPlayedBack) { [weak self] _ in
                guard index == 0 else { return }
                DispatchQueue.main.async { self?.playedOnce(playback) }
            }
            player.play()
        }
    }

    private func playedOnce(_ playback: Int) {
        guard playback == generation else { return }
        if let until = repeatUntil, Date() < until {
            DispatchQueue.main.asyncAfter(deadline: .now() + gap) { [weak self] in self?.schedule(playback) }
        } else {
            // Let the reverb and echo tail ring out before stopping.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                guard let self, playback == self.generation else { return }
                self.stop()
                self.onFinished?()
            }
        }
    }
}
