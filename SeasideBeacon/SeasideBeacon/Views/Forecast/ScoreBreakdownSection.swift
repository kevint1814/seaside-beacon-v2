import SwiftUI

/// Score breakdown — how each atmospheric factor contributed.
/// Renders as a flat VStack (no Section wrapper) for use in premium cards.
struct ScoreBreakdownSection: View {
    let breakdown: ScoreBreakdown
    let labels: AtmosphericLabels

    @State private var animateIn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var hasBonuses: Bool {
        breakdown.synergy > 0 || breakdown.postRainBonus > 0 || breakdown.solarBonus > 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            factorRow("Cloud Cover", factor: breakdown.cloudCover, label: labels.cloudLabel, index: 0)
            factorRow("Cloud Layers",
                       ratio: breakdown.multiLevelCloud.ratio,
                       score: breakdown.multiLevelCloud.score,
                       max: breakdown.multiLevelCloud.maxScore,
                       label: labels.cloudLayerLabel, index: 1)
            factorRow("Humidity", factor: breakdown.humidity, label: labels.humidityLabel, index: 2)
            factorRow("Pressure",
                       ratio: breakdown.pressureTrend.ratio,
                       score: breakdown.pressureTrend.score,
                       max: breakdown.pressureTrend.maxScore,
                       label: labels.pressureLabel, index: 3)
            factorRow("Aerosol Depth", factor: breakdown.aod, label: labels.aodLabel, index: 4)
            factorRow("Visibility", factor: breakdown.visibility, label: labels.visibilityLabel, index: 5)
            factorRow("Weather", factor: breakdown.weather, label: "", index: 6)
            factorRow("Wind", factor: breakdown.wind, label: labels.windLabel, index: 7)

            if hasBonuses {
                Divider().opacity(0.3).padding(.vertical, Spacing.xs)

                Text("BONUSES")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .tracking(1.0)

                if breakdown.synergy > 0 { bonusRow("Synergy", value: breakdown.synergy) }
                if breakdown.postRainBonus > 0 { bonusRow("Post-Rain", value: breakdown.postRainBonus) }
                if breakdown.solarBonus > 0 { bonusRow("Solar", value: breakdown.solarBonus) }
            }
        }
        .onAppear {
            guard !animateIn else { return }
            if reduceMotion {
                animateIn = true
            } else {
                withAnimation(.easeOut(duration: 0.5).delay(0.2)) { animateIn = true }
            }
        }
    }

    // MARK: - Rows

    private func factorRow(_ name: String, factor: FactorScore, label: String, index: Int) -> some View {
        factorRow(name, ratio: factor.ratio, score: factor.score, max: factor.maxScore, label: label, index: index)
    }

    private func factorRow(_ name: String, ratio: Double, score: Int, max: Int, label: String, index: Int) -> some View {
        let color = barColor(ratio)
        let clamped = min(ratio, 1.0)
        let delay = reduceMotion ? 0 : Double(index) * 0.06

        return VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(name).font(.subheadline)
                Spacer()
                Text("\(score)").monospacedDigit().foregroundStyle(.primary)
                + Text("/\(max)").font(.caption).foregroundStyle(.tertiary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.primary.opacity(0.06))
                    RoundedRectangle(cornerRadius: 3)
                        .fill(
                            LinearGradient(
                                colors: [color.opacity(0.5), color],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(animateIn ? clamped : 0))
                        .animation(.easeOut(duration: 0.5).delay(delay), value: animateIn)
                }
            }
            .frame(height: 6)

            if !label.isEmpty {
                Text(label).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, Spacing.xxs)
    }

    private func bonusRow(_ name: String, value: Int) -> some View {
        HStack {
            Text(name).font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            Text("+\(value)").font(.subheadline).monospacedDigit().foregroundStyle(.green)
        }
    }

    private func barColor(_ ratio: Double) -> Color {
        switch ratio {
        case 0.7...: return .green
        case 0.4..<0.7: return .orange
        default: return .red
        }
    }
}
