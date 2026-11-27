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

/// Small round icon button with a subtle fill, for secondary actions.
struct GhostIconButtonStyle: ButtonStyle {
    var size: CGFloat = 38

    func makeBody(configuration: Configuration) -> some View {
        GhostBody(configuration: configuration, size: size)
    }

    private struct GhostBody: View {
        let configuration: ButtonStyleConfiguration
        let size: CGFloat
        @Environment(\.isEnabled) private var isEnabled
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(.system(size: size * 0.36, weight: .semibold, design: .rounded))
                .foregroundStyle(hovering ? Color.primary : Color.secondary)
                .frame(width: size, height: size)
                .background(Circle().fill(Color.primary.opacity(hovering ? 0.12 : 0.06)))
                .overlay(Circle().strokeBorder(Color.primary.opacity(0.06)))
                .scaleEffect(configuration.isPressed ? 0.9 : 1)
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(Circle())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hovering)
        }
    }
}

/// The main round action button: solid gradient, white glyph, soft coloured glow.
struct PrimaryCircleButtonStyle: ButtonStyle {
    var tint: Color
    var size: CGFloat = 58

    func makeBody(configuration: Configuration) -> some View {
        PrimaryBody(configuration: configuration, tint: tint, size: size)
    }

    private struct PrimaryBody: View {
        let configuration: ButtonStyleConfiguration
        let tint: Color
        let size: CGFloat
        @State private var hovering = false

        var body: some View {
            configuration.label
                .font(.system(size: size * 0.34, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(Circle().fill(tint.gradient))
                .overlay(Circle().strokeBorder(Color.white.opacity(0.18)))
                .shadow(color: tint.opacity(hovering ? 0.6 : 0.4), radius: hovering ? 16 : 11, y: 4)
                .scaleEffect(configuration.isPressed ? 0.9 : (hovering ? 1.05 : 1))
                .contentShape(Circle())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hovering)
                .animation(.easeInOut(duration: 0.4), value: tint)
        }
    }
}

/// Compact toggle chip. When on: softly tinted with accent text; when off: quiet grey.
struct ChipStyle: ButtonStyle {
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
                .padding(.horizontal, 10)
                .frame(height: 26)
                .foregroundStyle(isOn ? Color.accentColor : (hovering ? Color.primary : Color.secondary))
                .background(
                    Capsule().fill(isOn ? Color.accentColor.opacity(0.18)
                                        : Color.primary.opacity(hovering ? 0.09 : 0.05))
                )
                .overlay(
                    Capsule().strokeBorder(isOn ? Color.accentColor.opacity(0.45)
                                                : Color.primary.opacity(0.07))
                )
                .scaleEffect(configuration.isPressed ? 0.94 : 1)
                .opacity(isEnabled ? 1 : 0.4)
                .contentShape(Capsule())
                .onHover { hovering = $0 }
                .animation(.spring(response: 0.25, dampingFraction: 0.6), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hovering)
                .animation(.easeInOut(duration: 0.2), value: isOn)
        }
    }
}

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
