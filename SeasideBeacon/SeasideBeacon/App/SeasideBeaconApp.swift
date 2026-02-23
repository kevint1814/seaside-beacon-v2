import SwiftUI

@main
struct SeasideBeaconApp: App {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showLaunch = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                Group {
                    if hasCompletedOnboarding {
                        MainTabView()
                    } else {
                        OnboardingView()
                    }
                }
                .opacity(showLaunch ? 0 : 1)

                if showLaunch {
                    LaunchView {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            showLaunch = false
                        }
                    }
                    .transition(.opacity)
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}
