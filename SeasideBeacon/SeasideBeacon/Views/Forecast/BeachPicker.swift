import SwiftUI

/// Horizontal beach pill selector — visible, not hidden in a menu.
/// Haptic on selection change.
struct BeachPicker: View {
    let beaches: [Beach]
    @Binding var selected: Beach

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.sm) {
                ForEach(beaches) { beach in
                    let isSelected = beach.key == selected.key
                    Button {
                        selected = beach
                    } label: {
                        Text(shortName(beach.name))
                            .font(.subheadline.weight(isSelected ? .semibold : .regular))
                            .foregroundStyle(isSelected ? .white : .secondary)
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.sm)
                            .background {
                                if isSelected {
                                    Capsule().fill(MaterialStyle.accent)
                                } else {
                                    Capsule().fill(.ultraThinMaterial)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
        .sensoryFeedback(.selection, trigger: selected.key)
    }

    /// "Marina Beach" → "Marina", "Elliot's Beach" → "Elliot's"
    private func shortName(_ name: String) -> String {
        name.replacingOccurrences(of: " Beach", with: "")
    }
}
