import SwiftUI
import AppKit

/// Capsule button: plain (subtle grey) or filled (accent gradient), with hover and press motion.
struct PillButtonStyle: ButtonStyle {
    var filled = false
    var large = false
    /// Stretches to fill its grid cell, for the reminder buttons.
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        PillBody(configuration: configuration, filled: filled, large: large, compact: compact)
    }

    private struct PillBody: View {
        let configuration: ButtonStyleConfiguration
        let filled: Bool
        let large: Bool
        let compact: Bool
        @Environment(\.isEnabled) private var isEnabled
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(large ? .headline : .callout.weight(.medium))
                .lineLimit(1)
                .padding(.horizontal, large ? 26 : (compact ? 0 : 12))
                .padding(.vertical, large ? 10 : 5)
                .frame(maxWidth: compact ? .infinity : nil)
                .foregroundStyle(filled ? Color.white : Color.primary)
                .background(Capsule().fill(background))
                .shadow(color: glowColor, radius: hovering ? 12 : 7, y: 3)
                .scaleEffect(configuration.isPressed ? 0.93 : (hovering && isEnabled ? 1.04 : 1))
                .opacity(isEnabled ? 1 : 0.4)
                .contentShape(Capsule())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hovering)
                .animation(.easeInOut(duration: 0.2), value: filled)
        }

        private var background: AnyShapeStyle {
            filled
                ? AnyShapeStyle(Color.accentColor.gradient)
                : AnyShapeStyle(Color.primary.opacity(hovering ? 0.12 : 0.07))
        }

        private var glowColor: Color {
            guard filled, large, isEnabled else { return .clear }
            return Color.accentColor.opacity(hovering ? 0.55 : 0.35)
        }
    }
}

/// Round control button, like the Clock app's Cancel / Pause buttons.
struct CircleButtonStyle: ButtonStyle {
    var tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 68, height: 68)
            .background(Circle().fill(tint.opacity(configuration.isPressed ? 0.32 : 0.18)))
            .overlay(Circle().strokeBorder(tint.opacity(0.22), lineWidth: 1).padding(-4))
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .contentShape(Circle())
            .animation(.spring(response: 0.25, dampingFraction: 0.55), value: configuration.isPressed)
    }
}

/// Translucent, blurred window background.
struct VisualEffectBackground: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .sidebar
        view.blendingMode = .behindWindow
        view.state = .followsWindowActiveState
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}
