import SwiftUI

/// Three-page onboarding — simple, restrained, system-native.
/// No atmospheric canvas, no custom animations. Just clear messaging.
struct OnboardingView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompleted = false
    @State private var currentPage = 0

    var body: some View {
        TabView(selection: $currentPage) {
            page(
                icon: "sun.horizon",
                title: "Sunrise Forecasts",
                subtitle: "Know if tomorrow's sunrise will be worth waking up for. Our algorithm reads 9 atmospheric factors to predict sky quality."
            )
            .tag(0)

            page(
                icon: "camera",
                title: "Photography Ready",
                subtitle: "Get camera settings tuned for the morning's conditions — DSLR and mobile. Show up prepared."
            )
            .tag(1)

            page(
                icon: "sparkles",
                title: "Four Beaches, One Score",
                subtitle: "Marina, Elliot's, Covelong, Thiruvanmiyur. Each scored independently based on local conditions."
            )
            .tag(2)
        }
        .tabViewStyle(.page(indexDisplayMode: .always))
        .overlay(alignment: .bottom) {
            Button {
                if currentPage < 2 {
                    withAnimation(.smooth) { currentPage += 1 }
                } else {
                    hasCompleted = true
                }
            } label: {
                Text(currentPage < 2 ? "Next" : "Get Started")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
            }
            .buttonStyle(.borderedProminent)
            .tint(MaterialStyle.accent)
            .padding(.horizontal, Spacing.xxl)
            .padding(.bottom, Spacing.xxxl)
        }
        .overlay(alignment: .topTrailing) {
            if currentPage < 2 {
                Button("Skip") {
                    hasCompleted = true
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(Spacing.xl)
            }
        }
        .sensoryFeedback(.selection, trigger: currentPage)
    }

    private func page(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: Spacing.xl) {
            Spacer()

            Image(systemName: icon)
                .font(.system(size: 56, weight: .thin))
                .foregroundStyle(MaterialStyle.accent)

            Text(title)
                .font(.title.bold())
                .multilineTextAlignment(.center)

            Text(subtitle)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, Spacing.xxl)
    }
}

#Preview {
    OnboardingView()
}
