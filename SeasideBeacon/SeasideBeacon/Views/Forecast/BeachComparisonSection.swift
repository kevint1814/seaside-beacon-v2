import SwiftUI

/// Nearby beach scores — tap to switch. Renders as flat content for premium cards.
struct BeachComparisonSection: View {
    let comparisons: [BeachComparison]
    let onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: Spacing.sm) {
            ForEach(comparisons) { comp in
                Button {
                    onSelect(comp.beach)
                } label: {
                    HStack(spacing: Spacing.lg) {
                        VStack(alignment: .leading, spacing: Spacing.xxs) {
                            Text(comp.beachName).font(.subheadline)
                            Text(comp.verdict).font(.caption)
                                .foregroundStyle(MaterialStyle.verdictColor(for: comp.verdict))
                        }
                        Spacer()
                        miniScoreArc(score: comp.score)
                    }
                }
                .tint(.primary)
            }
        }
    }

    private func miniScoreArc(score: Int) -> some View {
        let color = MaterialStyle.scoreColor(for: score)
        let progress = Double(score) / 100.0

        return ZStack {
            Circle()
                .trim(from: 0, to: 0.75)
                .stroke(Color.primary.opacity(0.06), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(135))
            Circle()
                .trim(from: 0, to: progress * 0.75)
                .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(135))
            Text("\(score)")
                .font(.caption2.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
        }
        .frame(width: 36, height: 36)
    }
}
