import SwiftUI

/// Premium card system for Seaside Beacon.
///
/// Warm-tinted cards with subtle gradient borders that echo the sunrise palette.
/// Replaces the default `insetGrouped` grey cards.
extension View {

    /// Premium list row background — warm-tinted to match the premium card system.
    func glassRow() -> some View {
        self
            .listRowBackground(
                Color(red: 0.11, green: 0.09, blue: 0.15)
            )
    }

    /// Frosted glass card for non-List content.
    func glassCard(cornerRadius: CGFloat = 16) -> some View {
        self
            .padding(Spacing.lg)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
            .padding(.horizontal, Spacing.lg)
    }

    /// Premium warm-tinted card — the signature Seaside Beacon card.
    ///
    /// Deep midnight fill with a subtle gradient border that catches light
    /// from the top-left, implying the sunrise glow.
    func premiumCard(cornerRadius: CGFloat = 20) -> some View {
        self
            .padding(Spacing.lg)
            .background {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.11, green: 0.09, blue: 0.15),
                                Color(red: 0.08, green: 0.07, blue: 0.11)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .strokeBorder(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.10),
                                        MaterialStyle.accent.opacity(0.06),
                                        Color.white.opacity(0.03)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 0.5
                            )
                    )
                    .shadow(color: .black.opacity(0.25), radius: 12, y: 4)
            }
            .padding(.horizontal, Spacing.lg)
    }

    /// Dark elevated card — simpler variant for secondary content.
    func darkCard(cornerRadius: CGFloat = 20) -> some View {
        self
            .padding(Spacing.lg)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color(red: 0.09, green: 0.08, blue: 0.12))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .strokeBorder(Color.white.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .padding(.horizontal, Spacing.lg)
    }

    /// Accent-colored section header for List/Form — replaces default grey headers.
    func premiumSectionHeader() -> some View {
        self
            .font(.caption.weight(.semibold))
            .foregroundStyle(MaterialStyle.accent.opacity(0.7))
            .tracking(1.0)
            .textCase(.uppercase)
            .listRowInsets(EdgeInsets(top: Spacing.lg, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
    }

    /// Accent-colored section footer for List/Form.
    func premiumSectionFooter() -> some View {
        self
            .font(.caption2)
            .foregroundStyle(.tertiary)
    }
}

/// Uppercase, letter-spaced section header in the accent color.
struct SectionLabel: View {
    let title: String
    var icon: String? = nil

    var body: some View {
        HStack(spacing: Spacing.sm) {
            if let icon {
                Image(systemName: icon)
                    .font(.caption2)
                    .foregroundStyle(MaterialStyle.accent.opacity(0.7))
            }
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(MaterialStyle.accent.opacity(0.7))
                .tracking(1.2)
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
