import SwiftUI

/// The hero score display — large number + arc + verdict.
///
/// Motion choreography (Lumy-level restraint):
/// 1. Brief pause after view appears (0.3s) — lets the eye land
/// 2. Arc draws in slowly (1.4s ease-out) — deliberate, never rushed
/// 3. Score number fades up during arc draw
/// 4. Verdict fades in after arc completes
/// 5. Single light haptic when score resolves — one, restrained
///
/// Visual layers:
/// - Glow: blurred copy of the progress arc for a soft halo
/// - Gradient arc: AngularGradient from faded to full score color
/// - End cap: small dot at the arc tip for deliberate termination
///
/// When Reduce Motion is on: everything appears immediately, no arc animation.
struct ScoreView: View {
    let score: Int
    let verdict: String

    @State private var arcProgress: Double = 0
    @State private var numberOpacity: Double = 0
    @State private var verdictOpacity: Double = 0
    @State private var hasResolved = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var scoreColor: Color {
        MaterialStyle.scoreColor(for: score)
    }

    var body: some View {
        VStack(spacing: Spacing.md) {
            ZStack {
                // Track — subtle, barely there
                Circle()
                    .trim(from: 0, to: 0.75)
                    .stroke(Color.primary.opacity(0.06), style: arcStyle)
                    .rotationEffect(.degrees(135))

                // Glow layer — blurred arc behind the main stroke
                Circle()
                    .trim(from: 0, to: arcProgress * 0.75)
                    .stroke(scoreColor.opacity(0.4), style: StrokeStyle(lineWidth: 12, lineCap: .round))
                    .rotationEffect(.degrees(135))
                    .blur(radius: 8)

                // Gradient progress arc
                Circle()
                    .trim(from: 0, to: arcProgress * 0.75)
                    .stroke(
                        AngularGradient(
                            colors: [scoreColor.opacity(0.35), scoreColor],
                            center: .center,
                            startAngle: .degrees(135),
                            endAngle: .degrees(135 + 270)
                        ),
                        style: arcStyle
                    )
                    .rotationEffect(.degrees(135))

                // End cap dot — positioned at arc tip
                if arcProgress > 0.02 {
                    Circle()
                        .fill(scoreColor)
                        .frame(width: 8, height: 8)
                        .offset(endCapOffset)
                        .opacity(numberOpacity)
                }

                // Score number
                Text("\(score)")
                    .font(Typography.scoreDisplay)
                    .fontDesign(.rounded)
                    .monospacedDigit()
                    .opacity(numberOpacity)
                    .contentTransition(.numericText(value: Double(score)))
            }
            .frame(width: 148, height: 148)

            // Verdict
            Text(verdict)
                .font(Typography.verdict)
                .foregroundStyle(MaterialStyle.verdictColor(for: verdict))
                .opacity(verdictOpacity)
        }
        .sensoryFeedback(.impact(weight: .light, intensity: 0.6), trigger: hasResolved)
        .onAppear { animateIn() }
        .onChange(of: score) { _, _ in animateIn() }
    }

    // MARK: - Arc Style

    private var arcStyle: StrokeStyle {
        StrokeStyle(lineWidth: 6, lineCap: .round)
    }

    // MARK: - End Cap Position

    /// Computes the offset for the dot at the end of the arc.
    private var endCapOffset: CGSize {
        let radius: Double = 74 // half of frame width
        let startAngleDeg: Double = 135
        let sweepDeg: Double = 270 * arcProgress
        let endAngleDeg = startAngleDeg + sweepDeg
        let endAngleRad = endAngleDeg * .pi / 180
        return CGSize(
            width: radius * cos(endAngleRad),
            height: radius * sin(endAngleRad)
        )
    }

    // MARK: - Choreography

    private func animateIn() {
        let targetProgress = Double(score) / 100.0

        if reduceMotion {
            arcProgress = targetProgress
            numberOpacity = 1
            verdictOpacity = 1
            hasResolved = true
            return
        }

        // Reset
        arcProgress = 0
        numberOpacity = 0
        verdictOpacity = 0
        hasResolved = false

        // 1. Brief pause, then arc draws
        withAnimation(.easeOut(duration: 1.4).delay(0.3)) {
            arcProgress = targetProgress
        }

        // 2. Number fades up during arc draw
        withAnimation(.easeOut(duration: 0.6).delay(0.5)) {
            numberOpacity = 1
        }

        // 3. Verdict appears after arc settles
        withAnimation(.easeOut(duration: 0.4).delay(1.5)) {
            verdictOpacity = 1
        }

        // 4. Haptic when resolved
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.7) {
            hasResolved = true
        }
    }
}

#Preview {
    ScoreView(score: 87, verdict: "Great")
        .padding(Spacing.xxxl)
}
