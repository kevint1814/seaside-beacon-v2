import SwiftUI

/// Helpers for system materials and Liquid Glass.
/// One place to manage glass usage — keeps the rest of the codebase clean.
enum MaterialStyle {

    // MARK: - Accent Colors

    /// Warm sunrise copper — the app's identity color.
    static let accent = Color(red: 0.89, green: 0.45, blue: 0.23)

    // MARK: - Verdict Colors

    static func verdictColor(for verdict: String) -> Color {
        switch verdict.lowercased() {
        case "go", "great", "excellent", "stunning":
            return .green
        case "good", "nice":
            return Color(red: 0.34, green: 0.77, blue: 0.46)
        case "maybe", "decent", "fair":
            return .orange
        case "skip", "poor":
            return .red
        default:
            return .secondary
        }
    }

    /// Score color on a continuous gradient: red (0) -> orange -> green (100).
    static func scoreColor(for score: Int) -> Color {
        switch score {
        case 85...100: return .green
        case 70..<85:  return Color(red: 0.2, green: 0.7, blue: 0.4)
        case 50..<70:  return .orange
        case 30..<50:  return Color(red: 0.95, green: 0.6, blue: 0.1)
        default:       return .red
        }
    }

    // MARK: - Recommendation Badge

    struct RecommendationBadge {
        let text: String
        let icon: String
        let color: Color

        static func forScore(_ score: Int) -> RecommendationBadge {
            switch score {
            case 70...:
                return RecommendationBadge(
                    text: "Worth the early alarm",
                    icon: "checkmark.circle.fill",
                    color: .green
                )
            case 55..<70:
                return RecommendationBadge(
                    text: "Could surprise you",
                    icon: "circle.dotted.circle",
                    color: .orange
                )
            case 40..<55:
                return RecommendationBadge(
                    text: "Soft colors possible",
                    icon: "circle.dotted.circle",
                    color: .orange
                )
            case 25..<40:
                return RecommendationBadge(
                    text: "Muted sunrise likely",
                    icon: "xmark.circle.fill",
                    color: .red
                )
            default:
                return RecommendationBadge(
                    text: "Sunrise likely not visible",
                    icon: "minus.circle",
                    color: .secondary
                )
            }
        }
    }
}
