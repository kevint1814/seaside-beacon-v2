import SwiftUI

/// The Seaside Beacon logo — an 8-ray sun rendered as a premium SwiftUI view.
///
/// Based on the website's SVG favicon: a central circle with 8 radiating lines.
/// Enhanced with gradients, glow effects, and optional animation for the
/// launch screen.
///
/// Usage:
///   BeaconLogo(size: 80)                    // Static
///   BeaconLogo(size: 120, animated: true)   // Animated (rays scale in, glow pulses)
struct BeaconLogo: View {
    var size: CGFloat = 80
    var animated: Bool = false

    @State private var rayScale: CGFloat = 0
    @State private var glowOpacity: Double = 0
    @State private var rotation: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The warm gold from the website SVG (#F5A623).
    private let gold = Color(red: 0.96, green: 0.65, blue: 0.14)
    private let copper = MaterialStyle.accent

    var body: some View {
        ZStack {
            // Outer glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [gold.opacity(0.3), gold.opacity(0.0)],
                        center: .center,
                        startRadius: size * 0.15,
                        endRadius: size * 0.55
                    )
                )
                .frame(width: size * 1.2, height: size * 1.2)
                .opacity(animated ? glowOpacity : 0.6)

            // Radiating rays
            ForEach(0..<8, id: \.self) { i in
                ray
                    .rotationEffect(.degrees(Double(i) * 45))
            }
            .scaleEffect(animated ? rayScale : 1.0)
            .rotationEffect(.degrees(animated ? rotation : 0))

            // Inner glow ring
            Circle()
                .fill(
                    RadialGradient(
                        colors: [gold.opacity(0.2), .clear],
                        center: .center,
                        startRadius: size * 0.1,
                        endRadius: size * 0.2
                    )
                )
                .frame(width: size * 0.5, height: size * 0.5)

            // Center sun circle — gradient for 3D depth
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 1.0, green: 0.78, blue: 0.3),  // bright highlight
                            gold,                                       // mid
                            copper                                      // shadow edge
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size * 0.375, height: size * 0.375)
                .shadow(color: gold.opacity(0.5), radius: size * 0.06)

            // Specular highlight on sun
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.white.opacity(0.5), .clear],
                        center: UnitPoint(x: 0.35, y: 0.3),
                        startRadius: 0,
                        endRadius: size * 0.12
                    )
                )
                .frame(width: size * 0.375, height: size * 0.375)
        }
        .frame(width: size, height: size)
        .onAppear {
            guard animated else { return }
            if reduceMotion {
                rayScale = 1
                glowOpacity = 0.6
                return
            }
            // Rays scale in
            withAnimation(.spring(response: 0.8, dampingFraction: 0.6).delay(0.2)) {
                rayScale = 1
            }
            // Glow fades in
            withAnimation(.easeOut(duration: 1.0).delay(0.4)) {
                glowOpacity = 0.6
            }
            // Subtle continuous rotation
            withAnimation(.linear(duration: 60).repeatForever(autoreverses: false)) {
                rotation = 360
            }
        }
    }

    // MARK: - Ray

    private var ray: some View {
        RoundedRectangle(cornerRadius: size * 0.02)
            .fill(
                LinearGradient(
                    colors: [gold, copper.opacity(0.6)],
                    startPoint: .bottom,
                    endPoint: .top
                )
            )
            .frame(width: size * 0.05, height: size * 0.18)
            .offset(y: -size * 0.34)
    }
}

#Preview {
    ZStack {
        Color(red: 0.04, green: 0.03, blue: 0.06)
            .ignoresSafeArea()
        VStack(spacing: 40) {
            BeaconLogo(size: 120, animated: true)
            BeaconLogo(size: 60)
        }
    }
}
