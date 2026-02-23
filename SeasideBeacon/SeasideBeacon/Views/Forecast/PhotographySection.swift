import SwiftUI

/// Photography settings — collapsed by default, expand to see details.
/// Renders as flat VStack content for use inside premium cards.
struct PhotographySection: View {
    let photography: Photography

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            if let dslr = photography.dslr {
                DisclosureGroup {
                    cameraGrid(dslr)
                } label: {
                    Label("DSLR", systemImage: "camera")
                }
            }

            if let mobile = photography.mobile {
                DisclosureGroup {
                    cameraGrid(mobile)
                } label: {
                    Label("Mobile", systemImage: "iphone")
                }
            }

            if !photography.compositionTips.isEmpty {
                DisclosureGroup {
                    ForEach(photography.compositionTips, id: \.self) { tip in
                        Text(tip).font(.subheadline).foregroundStyle(.secondary)
                    }
                } label: {
                    Label("Composition", systemImage: "viewfinder")
                }
            }

            if !photography.proTips.isEmpty {
                DisclosureGroup {
                    ForEach(photography.proTips, id: \.self) { tip in
                        Text(tip).font(.subheadline).foregroundStyle(.secondary)
                    }
                } label: {
                    Label("Pro Tips", systemImage: "sparkles")
                }
            }
        }
    }

    private func cameraGrid(_ settings: CameraSettings) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: Spacing.md) {
            settingCell("ISO", settings.iso)
            settingCell("Aperture", settings.aperture)
            settingCell("Shutter", settings.shutterSpeed)
            settingCell("WB", settings.whiteBalance)
            settingCell("Focus", settings.focusMode)
        }
        .padding(.vertical, Spacing.sm)
    }

    private func settingCell(_ label: String, _ value: String) -> some View {
        VStack(spacing: Spacing.xxs) {
            Text(value.isEmpty ? "—" : value)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.primary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.sm)
        .padding(.horizontal, Spacing.xs)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
    }
}
