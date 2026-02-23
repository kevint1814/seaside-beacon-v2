import SwiftUI

/// Shown when the forecast window is locked (7 AM – 6 PM IST).
///
/// All content sits in premium cards below the canvas.
/// No text on the canvas — the sunrise animation is purely decorative.
struct LockedForecastView: View {
    @Bindable var viewModel: ForecastViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                Spacer().frame(height: 100)

                // Countdown ring
                VStack(spacing: Spacing.sm) {
                    countdownRing
                    Text("at 6 PM tonight")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .premiumCard()

                // Explanation
                explanationSection
                    .premiumCard()

                // Subscribe CTA
                SubscribeSection(
                    selectedBeach: viewModel.selectedBeach,
                    beaches: viewModel.beaches
                )
                .premiumCard()

                Spacer().frame(height: Spacing.xxxl)
            }
        }
    }

    // MARK: - Countdown Ring

    private var countdownRing: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: 0.75)
                .stroke(Color.primary.opacity(0.06), style: ringStyle)
                .rotationEffect(.degrees(135))

            Circle()
                .trim(from: 0, to: viewModel.countdownProgress * 0.75)
                .stroke(
                    AngularGradient(
                        colors: [MaterialStyle.accent.opacity(0.35), MaterialStyle.accent],
                        center: .center,
                        startAngle: .degrees(135),
                        endAngle: .degrees(135 + 270)
                    ),
                    style: ringStyle
                )
                .rotationEffect(.degrees(135))

            VStack(spacing: Spacing.xs) {
                Text(viewModel.countdownText)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text("until forecast")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 160, height: 160)
    }

    private var ringStyle: StrokeStyle {
        StrokeStyle(lineWidth: 6, lineCap: .round)
    }

    // MARK: - Explanation

    private var explanationSection: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Text("Why evening predictions?")
                .font(.headline)

            bulletPoint(
                icon: "cloud.sun",
                text: "Cloud formations and humidity patterns stabilise in the late afternoon, making evening readings significantly more accurate."
            )
            bulletPoint(
                icon: "chart.line.uptrend.xyaxis",
                text: "Weather models update with fresher atmospheric data after 5 PM \u{2014} earlier forecasts carry too much uncertainty."
            )
            bulletPoint(
                icon: "moon.stars",
                text: "Evening forecasts let you plan your alarm and camera kit the night before."
            )
        }
    }

    private func bulletPoint(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            Image(systemName: icon)
                .foregroundStyle(.secondary)
                .frame(width: 22)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
