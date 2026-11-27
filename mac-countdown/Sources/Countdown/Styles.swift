import SwiftUI
import AppKit

// MARK: - Theme

/// Deep-space palette: navy/black base with iridescent pink, coral, cyan, violet and mint accents.
enum Theme {
    static let backgroundTop = Color(red: 0.05, green: 0.07, blue: 0.14)
    static let backgroundBottom = Color(red: 0.01, green: 0.015, blue: 0.04)
    static let discCenter = Color(red: 0.04, green: 0.06, blue: 0.12)
    static let discEdge = Color(red: 0.02, green: 0.03, blue: 0.07)

    static let mint = Color(red: 0.66, green: 0.96, blue: 0.86)
    static let cyan = Color(red: 0.36, green: 0.74, blue: 0.97)
    static let blue = Color(red: 0.28, green: 0.45, blue: 0.98)
    static let violet = Color(red: 0.58, green: 0.44, blue: 0.97)
    static let pink = Color(red: 0.93, green: 0.43, blue: 0.71)
    static let coral = Color(red: 0.97, green: 0.53, blue: 0.33)
    static let lavender = Color(red: 0.86, green: 0.84, blue: 1.0)
    static let indigo = Color(red: 0.36, green: 0.28, blue: 1.0)
    static let magenta = Color(red: 0.86, green: 0.32, blue: 0.92)
    static let cream = Color(red: 1.0, green: 0.93, blue: 0.80)
    static let gold = Color(red: 0.95, green: 0.68, blue: 0.36)
    static let sky = Color(red: 0.36, green: 0.62, blue: 0.98)
    static let deepBlue = Color(red: 0.12, green: 0.25, blue: 0.72)

    /// Rim colours for highlighted controls.
    static let iridescent: [Color] = [gold, cream, sky, blue, gold]

    /// Aurora colours behind the setup screen.
    static let calm: [Color] = [gold, sky, deepBlue, coral, cream]
}

/// Deep navy backdrop with faint aurora clouds.
struct SpaceBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.backgroundTop, Theme.backgroundBottom],
                           startPoint: .top, endPoint: .bottom)
            // Soft clouds drawn as radial gradients (cheaper than blurring).
            Circle()
                .fill(RadialGradient(colors: [Theme.gold.opacity(0.12), Theme.gold.opacity(0)],
                                     center: .center, startRadius: 0, endRadius: 230))
                .frame(width: 460, height: 460)
                .offset(x: -130, y: -220)
            Circle()
                .fill(RadialGradient(colors: [Theme.sky.opacity(0.12), Theme.sky.opacity(0)],
                                     center: .center, startRadius: 0, endRadius: 220))
                .frame(width: 440, height: 440)
                .offset(x: 140, y: 260)
        }
        .ignoresSafeArea()
    }
}

/// Dark frosted-glass panel with a light-catching edge.
struct GlassPanel: ViewModifier {
    var cornerRadius: CGFloat = 18

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(LinearGradient(colors: [Color.white.opacity(0.06), Color.white.opacity(0.02)],
                                         startPoint: .top, endPoint: .bottom))
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [Color.white.opacity(0.16), Color.white.opacity(0.03)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing))
            )
    }
}

extension View {
    func glassPanel(cornerRadius: CGFloat = 18) -> some View {
        modifier(GlassPanel(cornerRadius: cornerRadius))
    }
}

// MARK: - Orb (animated iridescent ribbons)

/// Overlapping translucent ribbons that wobble and drift around a circle, over a soft aurora.
/// Driven by `time` from a TimelineView. `energy` speeds up and deepens the wobble.
struct OrbView: View {
    var time: Double
    var palette: [Color]
    var energy: Double = 0.3
    var intensity: Double = 1
    /// 0 hides the ribbons (aurora only), 1 is full strength.
    var ribbonStrength: Double = 1

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) * 0.38
            let t = time

            // Aurora: soft colour clouds slowly orbiting the centre (radial gradients, no blur).
            var aurora = context
            aurora.blendMode = .plusLighter
            for (i, color) in palette.prefix(4).enumerated() {
                let angle = t * (0.18 + 0.25 * energy) + Double(i) * .pi / 2
                let p = CGPoint(x: center.x + cos(angle) * radius * 0.55,
                                y: center.y + sin(angle) * radius * 0.55)
                let r = radius * 0.95
                aurora.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                            with: .radialGradient(
                                Gradient(colors: [color.opacity(0.28 * intensity), color.opacity(0)]),
                                center: p, startRadius: 0, endRadius: r))
            }

            // Ribbons: faint glowing wisps that blend into the aurora.
            guard ribbonStrength > 0 else { return }
            let strength = intensity * ribbonStrength
            var ribbons = context
            ribbons.blendMode = .plusLighter
            for i in 0..<5 {
                let seed = Double(i)
                let color = palette[i % palette.count]
                let drift = CGPoint(x: center.x + cos(t * 0.31 + seed * 1.3) * radius * 0.05,
                                    y: center.y + sin(t * 0.27 + seed * 2.1) * radius * 0.05)
                let path = Self.blobPath(center: drift,
                                         radius: radius * (0.96 + 0.025 * seed),
                                         time: t * (0.6 + 0.9 * energy),
                                         seed: seed,
                                         wobble: 0.03 + 0.035 * energy)
                let a = t * 0.2 + seed * 1.7
                let start = CGPoint(x: center.x + cos(a) * radius, y: center.y + sin(a) * radius)
                let end = CGPoint(x: center.x - cos(a) * radius, y: center.y - sin(a) * radius)

                ribbons.fill(path, with: .radialGradient(
                    Gradient(colors: [color.opacity(0), color.opacity(0), color.opacity(0.05 * strength)]),
                    center: center, startRadius: 0, endRadius: radius * 1.1))
                // A wide, faint stroke for the glow…
                ribbons.stroke(path, with: .color(color.opacity(0.06 * strength)), lineWidth: 8)
                // …and a fine edge that fades in and out around the loop.
                ribbons.stroke(path, with: .linearGradient(
                    Gradient(colors: [color.opacity(0.5 * strength), color.opacity(0),
                                      Color.white.opacity(0.25 * strength), color.opacity(0.15 * strength)]),
                    startPoint: start, endPoint: end), lineWidth: 0.8)
            }
        }
    }

    /// A closed, gently wobbling circle.
    static func blobPath(center: CGPoint, radius: CGFloat, time: Double, seed: Double, wobble: Double) -> Path {
        var path = Path()
        let steps = 120
        for step in 0...steps {
            let theta = Double(step) / Double(steps) * 2 * .pi
            let r = radius * (1 + wobble * (0.6 * sin(2 * theta + time * 0.9 + seed * 1.9)
                                          + 0.4 * sin(3 * theta - time * 0.7 + seed * 3.1)))
            let point = CGPoint(x: center.x + cos(theta) * r, y: center.y + sin(theta) * r)
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}

/// A solar eclipse: black disc, fine cream rim, golden corona fading to blue, with soft
/// aura waves spreading outward from the rim. The bright rim is the time remaining
/// (clockwise from 12); the elapsed part fades back.
struct EclipseView: View {
    struct Palette {
        /// The fine line around the disc.
        var rim: Color
        /// The corona hugging the rim.
        var warm: Color
        /// The outer corona.
        var cool: Color
        /// The spreading waves: a neighbouring hue at the same colour temperature.
        var aura: Color
    }

    var time: Double
    /// Accumulated phase of the spreading waves, in cycles (see `AnimationClock`).
    var wavePhase: Double
    /// Accumulated phase of the corona's breathing, in radians.
    var breathPhase: Double
    /// Fraction of time left, 1 → 0.
    var progress: Double
    var palette: Palette
    var intensity: Double = 1

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) * 0.24
            let t = time
            let breath = 0.5 + 0.5 * sin(breathPhase)
            // The corona is brightest on the side of the "light", which drifts gently around the top.
            let lightAngle = -Double.pi / 2 + 0.35 * sin(t * 0.17)
            let lit = CGPoint(x: center.x + cos(lightAngle) * radius * 0.12,
                              y: center.y + sin(lightAngle) * radius * 0.12)

            func disc(_ c: CGPoint, _ r: CGFloat) -> Path {
                Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
            }

            var glow = context
            glow.blendMode = .plusLighter

            // 1. Cool outer corona (blue), gently lopsided in a slowly turning direction.
            var coolLayer = glow
            let squash = 0.07 + 0.05 * sin(t * 0.11)
            coolLayer.translateBy(x: lit.x, y: lit.y)
            coolLayer.rotate(by: .radians(t * 0.03))
            coolLayer.scaleBy(x: 1 + squash, y: 1 - squash * 0.6)
            coolLayer.translateBy(x: -lit.x, y: -lit.y)
            let coolRadius = radius * (1.86 + 0.06 * breath)
            coolLayer.fill(disc(lit, coolRadius), with: .radialGradient(
                Gradient(stops: [
                    .init(color: palette.cool.opacity(0), location: 0.42),
                    .init(color: palette.cool.opacity(0.5 * intensity), location: 0.6),
                    .init(color: palette.cool.opacity(0.18 * intensity), location: 0.8),
                    .init(color: palette.cool.opacity(0), location: 1),
                ]),
                center: lit, startRadius: 0, endRadius: coolRadius))

            // 2. Spreading aura: soft waves leave the rim and fade out. Each wave gets its own
            //    random direction, lean and strength, so it bulges more to one side.
            let waveCount = 3
            for k in 0..<waveCount {
                let position = wavePhase + Double(k) / Double(waveCount)
                let cycle = position.rounded(.down)
                let p = position - cycle  // 0 → 1 over the wave's life
                let seed = cycle * 3 + Double(k)
                let direction = Self.hash(seed) * 2 * .pi
                let lean = 0.35 + 0.5 * Self.hash(seed + 17.3)
                let strength = 0.55 + 0.45 * Self.hash(seed + 41.7)

                let shift = radius * lean * 0.35 * p
                let c = CGPoint(x: center.x + cos(direction) * shift, y: center.y + sin(direction) * shift)
                var wave = glow
                wave.translateBy(x: c.x, y: c.y)
                wave.rotate(by: .radians(direction))
                wave.scaleBy(x: 1 + 0.18 * lean * p, y: 1 - 0.1 * lean * p)
                wave.translateBy(x: -c.x, y: -c.y)

                let r = radius * (1.0 + 0.85 * p)
                let width = radius * (0.10 + 0.25 * p)
                let outer = r + width
                let fade = pow(1 - p, 1.6) * 0.42 * strength * intensity
                for (color, weight) in [(palette.aura, 1 - p), (palette.cool, p)] {
                    wave.fill(disc(c, outer), with: .radialGradient(
                        Gradient(stops: [
                            .init(color: color.opacity(0), location: max(0, (r - width) / outer)),
                            .init(color: color.opacity(fade * weight), location: r / outer),
                            .init(color: color.opacity(0), location: 1),
                        ]),
                        center: c, startRadius: 0, endRadius: outer))
                }
            }

            // Flares: soft plumes that swell and fade at slowly drifting points around the rim,
            // so the glow is never even all the way round.
            for i in 0..<4 {
                let s = Double(i)
                let drift: Double = i.isMultiple(of: 2) ? 1 : -1
                let angle = s * 1.7 + 0.3 * sin(t * 0.05 + s) + t * 0.02 * drift
                let swell = Self.noise(breathPhase * 0.35 + s * 2.3)
                let reach = radius * (1.1 + 0.35 * swell)
                let p = CGPoint(x: center.x + cos(angle) * reach, y: center.y + sin(angle) * reach)
                let plumeSize = radius * (0.45 + 0.25 * swell)
                let color = i.isMultiple(of: 2) ? palette.aura : palette.cool
                glow.fill(disc(p, plumeSize), with: .radialGradient(
                    Gradient(colors: [color.opacity(0.28 * swell * intensity), color.opacity(0)]),
                    center: p, startRadius: 0, endRadius: plumeSize))
            }

            // 3. Warm inner corona (gold) hugging the rim.
            let warmRadius = radius * (1.45 + 0.05 * breath)
            glow.fill(disc(lit, warmRadius), with: .radialGradient(
                Gradient(stops: [
                    .init(color: palette.warm.opacity(0), location: 0.55),
                    .init(color: palette.rim.opacity(0.75 * intensity), location: 0.68),
                    .init(color: palette.warm.opacity(0.5 * intensity), location: 0.78),
                    .init(color: palette.warm.opacity(0), location: 1),
                ]),
                center: lit, startRadius: 0, endRadius: warmRadius))

            // 4. The black disc.
            context.fill(disc(center, radius), with: .radialGradient(
                Gradient(colors: [.black, .black, Color(red: 0.07, green: 0.05, blue: 0.03)]),
                center: center, startRadius: 0, endRadius: radius))

            // 5. Rim: faint all the way round, bright for the time remaining.
            let shown = min(max(progress, 0), 1)
            let rim = Self.circlePath(center: center, radius: radius)
            context.stroke(rim, with: .color(palette.rim.opacity(0.16 * intensity)), lineWidth: 1)
            if shown > 0 {
                let remaining = rim.trimmedPath(from: 0, to: shown)
                glow.stroke(remaining, with: .color(palette.rim.opacity(0.2 * intensity)), lineWidth: 7)
                var bright = context
                bright.opacity = intensity
                bright.stroke(remaining, with: .linearGradient(
                    Gradient(colors: [palette.rim, palette.warm.opacity(0.7)]),
                    startPoint: CGPoint(x: center.x, y: center.y - radius),
                    endPoint: CGPoint(x: center.x, y: center.y + radius)), lineWidth: 1.6)
                // A second, finer inner line, like the double rim of a real eclipse.
                bright.stroke(Self.circlePath(center: center, radius: radius * 0.975).trimmedPath(from: 0, to: shown),
                              with: .color(palette.rim.opacity(0.35)), lineWidth: 0.6)
            }

            // Spark at the leading edge of the remaining time.
            if shown > 0, shown < 1 {
                let angle = -Double.pi / 2 + shown * 2 * .pi
                let p = CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
                let r: CGFloat = 11
                glow.fill(disc(p, r), with: .radialGradient(
                    Gradient(colors: [palette.rim.opacity(0.9 * intensity), palette.warm.opacity(0)]),
                    center: p, startRadius: 0, endRadius: r))
                context.fill(disc(p, 1.6), with: .color(.white.opacity(intensity)))
            }
        }
    }

    /// Repeatable pseudo-random number in 0…1 for a seed.
    static func hash(_ x: Double) -> Double {
        let v = sin(x * 12.9898) * 43758.5453
        return v - v.rounded(.down)
    }

    /// Smooth, wandering value in roughly 0…1.
    static func noise(_ x: Double) -> Double {
        0.5 + 0.5 * (0.6 * sin(x) + 0.4 * sin(x * 1.618 + 1.3))
    }

    /// A circle starting at 12 o'clock and running clockwise.
    static func circlePath(center: CGPoint, radius: CGFloat) -> Path {
        var path = Path()
        let steps = 120
        for step in 0...steps {
            let angle = -Double.pi / 2 + Double(step) / Double(steps) * 2 * .pi
            let point = CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        return path
    }
}

/// Accumulates animation phases frame by frame, so speeding the motion up never makes it
/// jump (multiplying a changing speed by the absolute clock would).
final class AnimationClock {
    private(set) var wavePhase = 0.0
    private(set) var breathPhase = 0.0
    private var lastTime: Double?

    func advance(to time: Double, waveSpeed: Double, breathSpeed: Double) {
        if let lastTime {
            let dt = min(max(time - lastTime, 0), 0.1)
            wavePhase += dt * waveSpeed
            breathPhase += dt * breathSpeed
        }
        lastTime = time
    }
}

/// Colour temperature over a countdown: icy blues at the start, warming through cyan,
/// violet and amber to red exactly when time is up. Sampled continuously, so the colours
/// drift smoothly instead of switching.
enum ColorTemperature {
    typealias RGB = (r: Double, g: Double, b: Double)
    typealias Stop = (at: Double, rgb: RGB)

    /// The fine rim line.
    static let rim: [Stop] = [
        (0.0, (0.92, 0.96, 1.00)),
        (0.6, (1.00, 0.95, 0.92)),
        (0.8, (1.00, 0.88, 0.75)),
        (1.0, (1.00, 0.78, 0.70)),
    ]
    /// The corona hugging the rim.
    static let inner: [Stop] = [
        (0.00, (0.80, 0.88, 1.00)),  // ice white-blue
        (0.35, (0.55, 0.85, 0.95)),  // cyan
        (0.60, (0.78, 0.62, 1.00)),  // lavender-violet
        (0.80, (1.00, 0.62, 0.35)),  // amber-orange
        (1.00, (1.00, 0.25, 0.18)),  // red
    ]
    /// The outer corona.
    static let outer: [Stop] = [
        (0.00, (0.12, 0.30, 0.85)),  // deep blue
        (0.35, (0.10, 0.45, 0.70)),  // teal-blue
        (0.60, (0.42, 0.22, 0.85)),  // violet
        (0.80, (0.75, 0.18, 0.45)),  // magenta-crimson
        (1.00, (0.65, 0.05, 0.12)),  // dark red
    ]

    /// Eclipse colours at a point in the countdown (0 = just started, 1 = time's up).
    /// `desaturate` fades them toward grey (used while paused).
    static func palette(elapsed: Double, desaturate: Double = 0) -> EclipseView.Palette {
        EclipseView.Palette(
            rim: color(sample(rim, elapsed), desaturate: desaturate),
            warm: color(sample(inner, elapsed), desaturate: desaturate),
            cool: color(sample(outer, elapsed), desaturate: desaturate),
            aura: color(sample(inner, elapsed + 0.15), desaturate: desaturate)
        )
    }

    static func sample(_ stops: [Stop], _ t: Double) -> RGB {
        let x = min(max(t, 0), 1)
        guard let upper = stops.firstIndex(where: { $0.at >= x }) else { return stops[stops.count - 1].rgb }
        guard upper > 0 else { return stops[0].rgb }
        let a = stops[upper - 1], b = stops[upper]
        let f = (x - a.at) / (b.at - a.at)
        let s = f * f * (3 - 2 * f)  // smoothstep, for gentle transitions between stops
        return (a.rgb.r + (b.rgb.r - a.rgb.r) * s,
                a.rgb.g + (b.rgb.g - a.rgb.g) * s,
                a.rgb.b + (b.rgb.b - a.rgb.b) * s)
    }

    static func color(_ rgb: RGB, desaturate amount: Double = 0) -> Color {
        let grey = (0.3 * rgb.r + 0.59 * rgb.g + 0.11 * rgb.b) * 0.8
        func mix(_ c: Double) -> Double { c + (grey - c) * amount }
        return Color(red: mix(rgb.r), green: mix(rgb.g), blue: mix(rgb.b))
    }
}

// MARK: - Controls

/// The main action: a glass orb with a glowing tinted core and an iridescent rim.
struct GlassOrbButtonStyle: ButtonStyle {
    var tint: Color
    var size: CGFloat = 62

    func makeBody(configuration: Configuration) -> some View {
        OrbBody(configuration: configuration, tint: tint, size: size)
    }

    private struct OrbBody: View {
        let configuration: ButtonStyleConfiguration
        let tint: Color
        let size: CGFloat
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(.system(size: size * 0.3, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(
                    ZStack {
                        Circle().fill(RadialGradient(colors: [tint.opacity(0.6), Theme.discEdge],
                                                     center: .center, startRadius: 0, endRadius: size * 0.62))
                        Circle()
                            .fill(LinearGradient(colors: [.white.opacity(0.25), .clear],
                                                 startPoint: .top, endPoint: .center))
                            .padding(2)
                        Circle().strokeBorder(
                            AngularGradient(colors: [tint, .white.opacity(0.9), tint.opacity(0.3), tint],
                                            center: .center),
                            lineWidth: 1.5)
                    }
                )
                .shadow(color: tint.opacity(hovering ? 0.8 : 0.5), radius: hovering ? 22 : 14)
                .scaleEffect(configuration.isPressed ? 0.9 : (hovering ? 1.06 : 1))
                .contentShape(Circle())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.2), value: hovering)
                .animation(.easeInOut(duration: 0.5), value: tint)
        }
    }
}

/// Small frosted-glass circle for secondary actions.
struct GlassIconButtonStyle: ButtonStyle {
    var size: CGFloat = 40

    func makeBody(configuration: Configuration) -> some View {
        IconBody(configuration: configuration, size: size)
    }

    private struct IconBody: View {
        let configuration: ButtonStyleConfiguration
        let size: CGFloat
        @Environment(\.isEnabled) private var isEnabled
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(.system(size: size * 0.33, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(hovering ? 0.95 : 0.65))
                .frame(width: size, height: size)
                .background(Circle().fill(Color.white.opacity(hovering ? 0.10 : 0.05)))
                .overlay(Circle().strokeBorder(
                    LinearGradient(colors: [.white.opacity(0.24), .white.opacity(0.04)],
                                   startPoint: .top, endPoint: .bottom)))
                .shadow(color: .white.opacity(hovering ? 0.12 : 0), radius: 8)
                .scaleEffect(configuration.isPressed ? 0.9 : 1)
                .opacity(isEnabled ? 1 : 0.3)
                .contentShape(Circle())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hovering)
        }
    }
}

/// Glass capsule with an iridescent outline and glow, for Start.
struct GlassCapsuleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        CapsuleBody(configuration: configuration)
    }

    private struct CapsuleBody: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 30)
                .padding(.vertical, 11)
                .background(Capsule().fill(
                    LinearGradient(colors: [.white.opacity(hovering ? 0.16 : 0.11), .white.opacity(0.03)],
                                   startPoint: .top, endPoint: .bottom)))
                .overlay(Capsule().strokeBorder(
                    LinearGradient(colors: Theme.iridescent, startPoint: .leading, endPoint: .trailing),
                    lineWidth: 1.3))
                .shadow(color: Theme.gold.opacity(isEnabled ? (hovering ? 0.6 : 0.35) : 0),
                        radius: hovering ? 18 : 12)
                .scaleEffect(configuration.isPressed ? 0.94 : (hovering && isEnabled ? 1.03 : 1))
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(Capsule())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.18), value: hovering)
        }
    }
}

/// Glass chip that lights up with an iridescent outline and glow when on.
struct GlassChipStyle: ButtonStyle {
    var isOn = false

    func makeBody(configuration: Configuration) -> some View {
        ChipBody(configuration: configuration, isOn: isOn)
    }

    private struct ChipBody: View {
        let configuration: ButtonStyleConfiguration
        let isOn: Bool
        @Environment(\.isEnabled) private var isEnabled
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .padding(.horizontal, 11)
                .frame(height: 26)
                .foregroundStyle(isOn ? Color.white : Color.white.opacity(hovering ? 0.85 : 0.55))
                .background(Capsule().fill(fill))
                .overlay(Capsule().strokeBorder(stroke, lineWidth: isOn ? 1.2 : 1))
                .shadow(color: isOn && isEnabled ? Theme.gold.opacity(0.45) : .clear, radius: 6)
                .scaleEffect(configuration.isPressed ? 0.93 : 1)
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(Capsule())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hovering)
                .animation(.easeInOut(duration: 0.25), value: isOn)
        }

        private var fill: AnyShapeStyle {
            isOn
                ? AnyShapeStyle(RadialGradient(colors: [Theme.gold.opacity(0.32), Theme.sky.opacity(0.16)],
                                               center: .center, startRadius: 0, endRadius: 30))
                : AnyShapeStyle(Color.white.opacity(hovering ? 0.08 : 0.04))
        }

        private var stroke: AnyShapeStyle {
            isOn
                ? AnyShapeStyle(LinearGradient(colors: Theme.iridescent, startPoint: .leading, endPoint: .trailing))
                : AnyShapeStyle(Color.white.opacity(0.09))
        }
    }
}

/// Glowing on/off switch: cyan→violet track with a lit knob when on.
struct GlowSwitchStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                configuration.isOn.toggle()
            }
        } label: {
            ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                Capsule()
                    .fill(configuration.isOn
                          ? AnyShapeStyle(LinearGradient(colors: [Theme.gold, Theme.sky],
                                                         startPoint: .leading, endPoint: .trailing))
                          : AnyShapeStyle(Color.white.opacity(0.08)))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(configuration.isOn ? 0.3 : 0.1)))
                    .shadow(color: Theme.gold.opacity(configuration.isOn ? 0.6 : 0), radius: 8)
                Circle()
                    .fill(Color.white.opacity(configuration.isOn ? 1 : 0.55))
                    .shadow(color: .white.opacity(configuration.isOn ? 0.9 : 0), radius: 4)
                    .padding(3)
            }
            .frame(width: 40, height: 22)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Layout

/// Lays children out left to right, wrapping onto new lines (for the reminder chips).
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            widest = max(widest, x + size.width)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Pause animations when hidden

/// True while the window is hidden (covered, minimised or on another Space), so the
/// animations can stop and save battery. The countdown itself keeps running.
private struct AnimationsPausedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var animationsPaused: Bool {
        get { self[AnimationsPausedKey.self] }
        set { self[AnimationsPausedKey.self] = newValue }
    }
}

/// Reports whether the hosting window is currently visible on screen.
struct WindowVisibilityReader: NSViewRepresentable {
    @Binding var isVisible: Bool

    func makeNSView(context: Context) -> ObservingView {
        let view = ObservingView()
        view.onChange = { visible in
            DispatchQueue.main.async { isVisible = visible }
        }
        return view
    }

    func updateNSView(_ nsView: ObservingView, context: Context) {}

    final class ObservingView: NSView {
        var onChange: ((Bool) -> Void)?
        private var observer: NSObjectProtocol?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let observer { NotificationCenter.default.removeObserver(observer) }
            observer = nil
            guard let window else { return }
            observer = NotificationCenter.default.addObserver(
                forName: NSWindow.didChangeOcclusionStateNotification, object: window, queue: .main
            ) { [weak self, weak window] _ in
                guard let window else { return }
                self?.onChange?(window.occlusionState.contains(.visible))
            }
            onChange?(window.occlusionState.contains(.visible))
        }

        deinit {
            if let observer { NotificationCenter.default.removeObserver(observer) }
        }
    }
}

// MARK: - Powered by badge

/// "Powered by Getworkdone" badge with the G logo; opens the website when clicked.
struct PoweredByBadge: View {
    private static let url = URL(string: "https://claude101.getworkdone.space")!
    /// Bundled into Contents/Resources by build-app.sh.
    private static let logo = NSImage(named: "getworkdone-logo")
    private static let glowBlue = Color(red: 0.32, green: 0.52, blue: 1.0)
    private static let paleBlue = Color(red: 0.82, green: 0.90, blue: 1.0)

    @State private var hovering = false

    var body: some View {
        Link(destination: Self.url) {
            HStack(spacing: 9) {
                (Text("Powered by ").foregroundStyle(.white.opacity(0.75))
                    + Text("Getworkdone").fontWeight(.bold).foregroundStyle(Self.paleBlue))
                    .font(.system(size: 12))
                    .shadow(color: Self.glowBlue.opacity(0.8), radius: 6)

                logoView
            }
            .padding(.leading, 14)
            .padding(.trailing, 4)
            .frame(height: 32)
            .background(Capsule().fill(
                LinearGradient(colors: [Color(red: 0.03, green: 0.05, blue: 0.12),
                                        Color(red: 0.01, green: 0.02, blue: 0.06)],
                               startPoint: .leading, endPoint: .trailing)))
            .overlay(Capsule().strokeBorder(
                LinearGradient(colors: [Self.glowBlue.opacity(0.55), Self.paleBlue.opacity(0.9)],
                               startPoint: .leading, endPoint: .trailing),
                lineWidth: 1.2))
            .shadow(color: Self.glowBlue.opacity(hovering ? 0.6 : 0.35), radius: hovering ? 12 : 8)
            .scaleEffect(hovering ? 1.03 : 1)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
        .help("Open claude101.getworkdone.space")
    }

    private var logoView: some View {
        ZStack {
            Circle().fill(Color.black)
            if let logo = Self.logo {
                Image(nsImage: logo)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: 22, height: 22)
                    .clipShape(Circle())
            } else {
                // Fallback when running without the app bundle (e.g. `swift run`).
                Text("G")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Self.paleBlue)
            }
        }
        .frame(width: 26, height: 26)
        .overlay(Circle().strokeBorder(Self.paleBlue.opacity(0.6), lineWidth: 1))
        .shadow(color: Self.glowBlue.opacity(0.7), radius: 5)
    }
}
