import SwiftUI

/// Root navigation — premium dark TabView.
///
/// Tab bar uses the deep midnight background to match the premium card system.
/// Nav bars are handled per-view via SwiftUI modifiers.
struct MainTabView: View {
    @State private var selectedTab = 0
    @State private var forecastVM = ForecastViewModel()

    var body: some View {
        TabView(selection: $selectedTab) {
            ForecastView(viewModel: forecastVM)
                .tabItem { Label("Forecast", systemImage: "sun.horizon") }
                .tag(0)

            ExploreView()
                .tabItem { Label("Explore", systemImage: "book") }
                .tag(1)

            CommunityView()
                .tabItem { Label("Community", systemImage: "person.2") }
                .tag(2)

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(3)
        }
        .tint(MaterialStyle.accent)
        .onAppear { configureTabBar() }
    }

    /// Set only the tab bar — nav bars are handled per-view.
    private func configureTabBar() {
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor(red: 0.06, green: 0.05, blue: 0.09, alpha: 1)
        tabAppearance.shadowColor = .clear
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }
}

#Preview {
    MainTabView()
        .preferredColorScheme(.dark)
}
