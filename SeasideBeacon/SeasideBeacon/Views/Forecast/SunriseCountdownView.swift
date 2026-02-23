import SwiftUI

/// Compact pill showing time until sunrise + golden hour window.
/// Placed in the hero section between ScoreView and weather summary.
/// Subtle breathing animation makes it feel "live."
struct SunriseCountdownView: View {
    let countdownText: String?
    let goldenHourText: String?

    @State private var isLive = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if countdownText != nil || goldenHourText != nil {
            VStack(spacing: Spacing.sm) {
                // Countdown pill
                if let countdown = countdownText {
                    Label {
                        Text(countdown)
                            .font(.caption.weight(.medium))
                            .monospacedDigit()
                            .contentTransition(.numericText())
                    } icon: {
                        Image(systemName: "sunrise")
                            .font(.caption)
                    }
                    .foregroundStyle(MaterialStyle.accent)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.xs + 2)
                    .background(
                        Capsule()
                            .fill(MaterialStyle.accent.opacity(0.1))
                    )
                    .opacity(reduceMotion ? 1.0 : (isLive ? 1.0 : 0.85))
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 3.0).repeatForever(autoreverses: true),
                        value: isLive
                    )
                }

                // Golden hour range
                if let golden = goldenHourText {
                    Text(golden)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .onAppear {
                if !reduceMotion { isLive = true }
            }
        }
    }
}
