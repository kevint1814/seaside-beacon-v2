import SwiftUI

/// System font scale — SF Pro only.
/// Named for semantic role, not visual size.
enum Typography {

    // MARK: - Score Display

    /// The large score number (e.g. "87"). Demands attention.
    static let scoreDisplay: Font = .system(size: 72, weight: .bold, design: .rounded)

    /// Verdict text below score (e.g. "Great").
    static let verdict: Font = .system(size: 20, weight: .semibold, design: .rounded)

    // MARK: - Navigation & Headers

    /// Beach name in the forecast header.
    static let beachName: Font = .system(size: 28, weight: .bold)

    /// Section headers (e.g. "Conditions", "Photography").
    static let sectionHeader: Font = .system(size: 13, weight: .semibold)

    // MARK: - Content

    /// Primary body text.
    static let body: Font = .body

    /// Secondary info (units, labels in rows).
    static let caption: Font = .caption

    /// Small metadata.
    static let footnote: Font = .footnote
}
