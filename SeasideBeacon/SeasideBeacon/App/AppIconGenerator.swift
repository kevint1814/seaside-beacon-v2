import UIKit

/// Generates the Seaside Beacon app icon programmatically.
///
/// Creates a 1024x1024 PNG with:
/// - Deep gradient background (midnight → deep purple)
/// - 8-ray sun/beacon symbol with gold-to-copper gradient
/// - Specular highlight for 3D depth
/// - Outer glow for warmth
///
/// All elements are scaled to 72% to stay within the iOS squircle safe zone
/// (which clips ~10-12% at corners).
enum AppIconGenerator {

    /// Scale factor — keeps the sun/rays within the iOS icon safe zone.
    private static let s: CGFloat = 0.72

    /// Renders the beacon logo to a 1024×1024 UIImage.
    static func render(size: CGFloat = 1024) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))

        return renderer.image { ctx in
            let gc = ctx.cgContext
            let center = CGPoint(x: size / 2, y: size / 2)

            // ── Background gradient ──────────────────────────────
            let bgColors: [CGColor] = [
                UIColor(red: 0.08, green: 0.06, blue: 0.14, alpha: 1).cgColor,
                UIColor(red: 0.03, green: 0.02, blue: 0.06, alpha: 1).cgColor
            ]
            let bgGradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: bgColors as CFArray,
                locations: [0, 1]
            )!
            gc.drawLinearGradient(bgGradient, start: .zero, end: CGPoint(x: size, y: size), options: [])

            // ── Outer glow ───────────────────────────────────────
            let glowRadius = size * 0.38
            let glowColors: [CGColor] = [
                UIColor(red: 0.96, green: 0.65, blue: 0.14, alpha: 0.20).cgColor,
                UIColor(red: 0.96, green: 0.65, blue: 0.14, alpha: 0.0).cgColor
            ]
            let glowGradient = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: glowColors as CFArray,
                locations: [0, 1]
            )!
            gc.drawRadialGradient(
                glowGradient,
                startCenter: center, startRadius: 0,
                endCenter: center, endRadius: glowRadius,
                options: []
            )

            // ── Rays (scaled to safe zone) ─────────────────────
            let rayWidth = size * 0.042 * s
            let rayLength = size * 0.14 * s
            let rayOffset = size * 0.22 * s

            let gold = UIColor(red: 0.96, green: 0.65, blue: 0.14, alpha: 1)
            let copper = UIColor(red: 0.89, green: 0.45, blue: 0.23, alpha: 1)

            for i in 0..<8 {
                let angle = CGFloat(i) * .pi / 4

                gc.saveGState()
                gc.translateBy(x: center.x, y: center.y)
                gc.rotate(by: angle)

                let rayRect = CGRect(
                    x: -rayWidth / 2,
                    y: -(rayOffset + rayLength),
                    width: rayWidth,
                    height: rayLength
                )

                let rayPath = UIBezierPath(roundedRect: rayRect, cornerRadius: rayWidth * 0.35)

                gc.saveGState()
                gc.addPath(rayPath.cgPath)
                gc.clip()

                let rayGradColors: [CGColor] = [copper.cgColor, gold.cgColor]
                let rayGrad = CGGradient(
                    colorsSpace: CGColorSpaceCreateDeviceRGB(),
                    colors: rayGradColors as CFArray,
                    locations: [0, 1]
                )!
                gc.drawLinearGradient(
                    rayGrad,
                    start: CGPoint(x: 0, y: -(rayOffset + rayLength)),
                    end: CGPoint(x: 0, y: -rayOffset),
                    options: []
                )
                gc.restoreGState()
                gc.restoreGState()
            }

            // ── Center circle — 3D gradient (scaled) ────────────
            let circleRadius = size * 0.14 * s
            let circlePath = UIBezierPath(
                arcCenter: center, radius: circleRadius,
                startAngle: 0, endAngle: .pi * 2, clockwise: true
            )

            gc.saveGState()
            gc.addPath(circlePath.cgPath)
            gc.clip()

            let circleColors: [CGColor] = [
                UIColor(red: 1.0, green: 0.82, blue: 0.35, alpha: 1).cgColor,
                UIColor(red: 0.96, green: 0.65, blue: 0.14, alpha: 1).cgColor,
                UIColor(red: 0.85, green: 0.42, blue: 0.18, alpha: 1).cgColor
            ]
            let circleGrad = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: circleColors as CFArray,
                locations: [0.0, 0.5, 1.0]
            )!
            gc.drawLinearGradient(
                circleGrad,
                start: CGPoint(x: center.x - circleRadius * 0.5, y: center.y - circleRadius * 0.5),
                end: CGPoint(x: center.x + circleRadius * 0.7, y: center.y + circleRadius * 0.7),
                options: []
            )
            gc.restoreGState()

            // ── Specular highlight ───────────────────────────────
            let highlightCenter = CGPoint(x: center.x - circleRadius * 0.25, y: center.y - circleRadius * 0.25)
            let highlightColors: [CGColor] = [
                UIColor.white.withAlphaComponent(0.45).cgColor,
                UIColor.white.withAlphaComponent(0.0).cgColor
            ]
            let highlightGrad = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: highlightColors as CFArray,
                locations: [0, 1]
            )!

            gc.saveGState()
            gc.addPath(circlePath.cgPath)
            gc.clip()
            gc.drawRadialGradient(
                highlightGrad,
                startCenter: highlightCenter, startRadius: 0,
                endCenter: highlightCenter, endRadius: circleRadius * 0.6,
                options: []
            )
            gc.restoreGState()
        }
    }

    /// Saves the icon to the app's Documents directory (for export).
    @discardableResult
    static func saveToDocuments() -> URL? {
        let image = render()
        guard let data = image.pngData() else { return nil }

        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let url = docs.appendingPathComponent("SeasideBeacon-AppIcon-1024.png")

        try? data.write(to: url)
        return url
    }
}
