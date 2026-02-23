import SwiftUI

/// AI-generated insights — the narrative core of every forecast.
///
/// Spacious editorial layout with stagger-reveal animations.
/// Each sub-section fades in sequentially for a polished reveal.
struct InsightsSection: View {
    let insights: Insights
    let beachName: String
    let score: Int

    @State private var headerVisible = false
    @State private var expectVisible = false
    @State private var gridVisible = false
    @State private var verdictVisible = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if hasContent {
            VStack(alignment: .leading, spacing: Spacing.xxl) {
                // ── Header: Dynamic title + badge ─────────────────
                panelHeader
                    .opacity(headerVisible ? 1 : 0)
                    .offset(y: headerVisible ? 0 : 8)

                // ── WHAT TO EXPECT ────────────────────────────────
                if !insights.insight.isEmpty {
                    whatToExpect
                        .opacity(expectVisible ? 1 : 0)
                        .offset(y: expectVisible ? 0 : 12)
                }

                // ── Two-column grid: SEE + VIBES ─────────────────
                if hasDetailContent {
                    twoColumnGrid
                        .opacity(gridVisible ? 1 : 0)
                        .offset(y: gridVisible ? 0 : 12)
                }

                // ── WORTH THE EARLY ALARM? ───────────────────────
                if !insights.worthWakingUp.isEmpty {
                    worthTheAlarm
                        .opacity(verdictVisible ? 1 : 0)
                        .offset(y: verdictVisible ? 0 : 12)
                }
            }
            .onAppear { staggerReveal() }
        }
    }

    // MARK: - Stagger Animation

    private func staggerReveal() {
        if reduceMotion {
            headerVisible = true
            expectVisible = true
            gridVisible = true
            verdictVisible = true
            return
        }

        withAnimation(.easeOut(duration: 0.35)) { headerVisible = true }
        withAnimation(.easeOut(duration: 0.4).delay(0.12)) { expectVisible = true }
        withAnimation(.easeOut(duration: 0.4).delay(0.24)) { gridVisible = true }
        withAnimation(.easeOut(duration: 0.4).delay(0.36)) { verdictVisible = true }
    }

    // MARK: - Panel Header

    private var panelHeader: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text(dynamicTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            let badge = MaterialStyle.RecommendationBadge.forScore(score)
            Label {
                Text(badge.text)
                    .font(.caption.weight(.medium))
            } icon: {
                Image(systemName: badge.icon)
                    .font(.caption2)
            }
            .foregroundStyle(badge.color)
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(Capsule().fill(badge.color.opacity(0.12)))
        }
    }

    /// Time-aware title matching the website.
    private var dynamicTitle: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let timeLabel: String
        if hour < 10 {
            timeLabel = "this morning's"
        } else if hour >= 18 {
            timeLabel = "tomorrow's"
        } else {
            timeLabel = "the next"
        }
        let beach = beachName.isEmpty ? "your beach" : beachName
        return "What \(timeLabel) sunrise will look like at \(beach)"
    }

    // MARK: - What To Expect

    private var whatToExpect: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            panelLabel("What to expect", icon: "sparkles")

            if !insights.greeting.isEmpty {
                Text(insights.greeting)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(insights.insight)
                .font(.body)
                .foregroundStyle(.primary)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.025))
        )
    }

    // MARK: - Two-Column Grid

    private var twoColumnGrid: some View {
        HStack(alignment: .top, spacing: 1) {
            if !insights.whatYoullSee.isEmpty {
                insightPanel(
                    label: "What you'll see",
                    text: insights.whatYoullSee,
                    icon: "eye"
                )
            }
            if !insights.beachVibes.isEmpty {
                insightPanel(
                    label: "Beach vibes",
                    text: insights.beachVibes,
                    icon: "water.waves"
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func insightPanel(label: String, text: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            panelLabel(label, icon: icon)

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.025))
    }

    // MARK: - Worth The Early Alarm

    private var worthTheAlarm: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "alarm")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(toneAccent)
                Text("Worth the early alarm?")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(toneAccent)
                    .tracking(1.0)
                    .textCase(.uppercase)
            }

            Text(insights.worthWakingUp)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(toneAccent.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(toneAccent.opacity(0.10), lineWidth: 0.5)
                )
        )
    }

    // MARK: - Shared Label Style

    private func panelLabel(_ text: String, icon: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.tertiary)
            Text(text)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.tertiary)
                .tracking(1.0)
                .textCase(.uppercase)
        }
    }

    // MARK: - Tone-Based Accent

    private var toneAccent: Color {
        switch score {
        case 70...: return MaterialStyle.accent
        case 40..<70: return Color(red: 0.54, green: 0.48, blue: 0.42)
        default: return Color(red: 0.43, green: 0.43, blue: 0.48)
        }
    }

    // MARK: - Helpers

    private var hasContent: Bool {
        !insights.insight.isEmpty || !insights.whatYoullSee.isEmpty
        || !insights.beachVibes.isEmpty || !insights.worthWakingUp.isEmpty
    }

    private var hasDetailContent: Bool {
        !insights.whatYoullSee.isEmpty || !insights.beachVibes.isEmpty
    }
}
