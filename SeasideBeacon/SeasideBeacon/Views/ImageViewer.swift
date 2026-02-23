import SwiftUI

/// Identifiable wrapper so `.fullScreenCover(item:)` works with a URL string.
struct ViewableImage: Identifiable {
    let id: String
    let url: String

    init(_ url: String) {
        self.id = url
        self.url = url
    }

    /// Strips Cloudinary crop/resize transforms and returns a full-quality URL.
    var fullSizeURL: String {
        guard let range = url.range(of: "/image/upload/") else { return url }
        let afterUpload = url[range.upperBound...]
        guard let slash = afterUpload.lastIndex(of: "/") else { return url }
        let publicID = afterUpload[slash...]
        return String(url[..<range.upperBound]) + "f_auto,q_auto" + publicID
    }
}

// MARK: - Expand Indicator

/// Small expand icon overlay for tappable images — tells users the image opens fullscreen.
extension View {
    func expandableOverlay() -> some View {
        self.overlay(alignment: .bottomTrailing) {
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white)
                .padding(6)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
                .padding(Spacing.sm)
        }
    }
}

/// Fullscreen image viewer — dark background, scaled to fit, close button.
struct ImageViewer: View {
    let url: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            AsyncImage(url: URL(string: url)) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                case .failure:
                    VStack(spacing: Spacing.md) {
                        Image(systemName: "photo")
                            .font(.system(size: 40))
                            .foregroundStyle(.white.opacity(0.3))
                        Text("Couldn't load image")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                default:
                    ProgressView()
                        .tint(.white)
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .white.opacity(0.35))
            }
            .padding()
        }
    }
}
