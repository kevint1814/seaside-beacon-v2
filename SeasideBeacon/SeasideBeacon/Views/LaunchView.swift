import SwiftUI

/// Native iOS splash — clean, immediate, no sequential reveals.
///
/// The logo and name appear instantly (like a native LaunchScreen).
/// A single subtle scale animation adds life without feeling "designed."
/// Total duration: ~1.5 seconds. No tagline. No staged reveals.
struct LaunchView: View {
    let onComplete: () -> Void

    @State private var scale: CGFloat = 0.92
    @State private var opacity: Double = 1

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let deepBg = Color(red: 0.04, green: 0.03, blue: 0.06)

    var body: some View {
        ZStack {
            deepBg.ignoresSafeArea()

            VStack(spacing: Spacing.xl) {
                BeaconLogo(size: 80)

                Text("Seaside Beacon")
                    .font(.title3.weight(.medium))
                    .tracking(1.0)
                    .foregroundStyle(.white.opacity(0.9))
            }
            .scaleEffect(scale)
        }
        .opacity(opacity)
        .onAppear {
            if reduceMotion {
                scale = 1
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    onComplete()
                }
                return
            }

            // Single subtle scale-up (iOS-native feel)
            withAnimation(.easeOut(duration: 0.6)) {
                scale = 1.0
            }

            // Dismiss
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                withAnimation(.easeIn(duration: 0.25)) {
                    opacity = 0
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    onComplete()
                }
            }
        }
    }
}

#Preview {
    LaunchView { }
}
