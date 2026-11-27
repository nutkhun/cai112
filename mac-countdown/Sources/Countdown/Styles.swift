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

    /// Rim colours for highlighted controls.
    static let iridescent: [Color] = [cyan, violet, pink, coral, cyan]

    // Ribbon palettes for the orb, by urgency.
    static let calm: [Color] = [pink, coral, cyan, violet, .white]
    static let warm: [Color] = [coral, pink, .orange, violet, .white]
    static let alarm: [Color] = [.red, coral, pink, .red, .white]
    static let rest: [Color] = [Color(white: 0.55), Color(red: 0.45, green: 0.5, blue: 0.65),
                                Color(white: 0.4), Color(red: 0.4, green: 0.45, blue: 0.6), .white]
}

/// Deep navy backdrop with faint aurora clouds.
struct SpaceBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.backgroundTop, Theme.backgroundBottom],
                           startPoint: .top, endPoint: .bottom)
            // Soft clouds drawn as radial gradients (cheaper than blurring).
            Circle()
                .fill(RadialGradient(colors: [Theme.cyan.opacity(0.12), Theme.cyan.opacity(0)],
                                     center: .center, startRadius: 0, endRadius: 230))
                .frame(width: 460, height: 460)
                .offset(x: -130, y: -220)
            Circle()
                .fill(RadialGradient(colors: [Theme.violet.opacity(0.12), Theme.violet.opacity(0)],
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

/// Twinkling star particles drifting slowly inside the glass disc.
struct ParticleField: View {
    var time: Double
    var energy: Double = 0.3
    var intensity: Double = 1
    var count = 46

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let maxRadius = min(size.width, size.height) / 2 * 0.92
            for i in 0..<count {
                let seed = Double(i)
                let baseAngle = Self.fract(sin(seed * 12.9898) * 43758.5453) * 2 * .pi
                let baseRadius = sqrt(Self.fract(sin(seed * 78.233) * 12345.678)) * maxRadius
                let direction: Double = i.isMultiple(of: 2) ? 1 : -1
                let angle = baseAngle + time * 0.04 * (1 + 2 * energy) * direction
                let p = CGPoint(x: center.x + cos(angle) * baseRadius, y: center.y + sin(angle) * baseRadius)
                let twinkle = 0.3 + 0.7 * (0.5 + 0.5 * sin(time * 1.6 + seed * 3.3))
                let s = 0.8 + Self.fract(seed * 0.618) * 1.5
                context.fill(Path(ellipseIn: CGRect(x: p.x - s / 2, y: p.y - s / 2, width: s, height: s)),
                             with: .color(.white.opacity(0.75 * twinkle * intensity)))
            }
        }
    }

    private static func fract(_ x: Double) -> Double { x - x.rounded(.down) }
}

/// Dark glass disc with a slowly turning glowing rim.
struct GlassDisc: View {
    var tint: Color
    var rotation: Double

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [Theme.discCenter, Theme.discEdge],
                                     center: .center, startRadius: 0, endRadius: 100))
            // Inner rim glow.
            Circle()
                .fill(RadialGradient(colors: [tint.opacity(0), tint.opacity(0), tint.opacity(0.18)],
                                     center: .center, startRadius: 0, endRadius: 90))
            Circle()
                .strokeBorder(
                    AngularGradient(colors: [tint.opacity(0.95), .white.opacity(0.6), tint.opacity(0.12),
                                             tint.opacity(0.55), tint.opacity(0.95)],
                                    center: .center),
                    lineWidth: 1.5
                )
                .rotationEffect(.degrees(rotation))
        }
        // Outer halo.
        .background(
            Circle()
                .fill(RadialGradient(colors: [tint.opacity(0.22), tint.opacity(0)],
                                     center: .center, startRadius: 85, endRadius: 120))
                .padding(-30)
        )
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
                .shadow(color: Theme.cyan.opacity(isEnabled ? (hovering ? 0.6 : 0.35) : 0),
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
                .shadow(color: isOn && isEnabled ? Theme.cyan.opacity(0.45) : .clear, radius: 6)
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
                ? AnyShapeStyle(RadialGradient(colors: [Theme.cyan.opacity(0.32), Theme.violet.opacity(0.16)],
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
                          ? AnyShapeStyle(LinearGradient(colors: [Theme.cyan, Theme.violet],
                                                         startPoint: .leading, endPoint: .trailing))
                          : AnyShapeStyle(Color.white.opacity(0.08)))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(configuration.isOn ? 0.3 : 0.1)))
                    .shadow(color: Theme.cyan.opacity(configuration.isOn ? 0.6 : 0), radius: 8)
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
