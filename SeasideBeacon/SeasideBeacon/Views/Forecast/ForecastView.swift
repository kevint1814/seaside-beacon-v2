import SwiftUI

/// The hero screen — premium editorial layout with scroll-reveal animations.
///
/// The animated sunrise canvas is purely decorative at the top.
/// Content flows in a ScrollView with warm-tinted premium cards.
/// Each section fades up as it enters the viewport.
struct ForecastView: View {
    @Bindable var viewModel: ForecastViewModel
    @State private var motionManager = SunriseMotionManager()

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    private let canvasHeight: CGFloat = 300
    private let deepBg = Color(red: 0.04, green: 0.03, blue: 0.06)

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                canvasBackground
                content
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .task {
                viewModel.checkAvailability()
                await viewModel.loadBeaches()
                await viewModel.loadForecast()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    viewModel.checkAvailability()
                    viewModel.updateSunriseCountdown()
                    if !reduceMotion { motionManager.start() }
                } else {
                    motionManager.stop()
                }
            }
            .onAppear {
                if !reduceMotion { motionManager.start() }
            }
            .onDisappear {
                motionManager.stop()
            }
        }
    }

    // MARK: - Canvas Background

    private var canvasBackground: some View {
        VStack(spacing: 0) {
            SunriseMetalView(
                tiltX: motionManager.tiltX,
                tiltY: motionManager.tiltY,
                reduceMotion: reduceMotion,
                isActive: scenePhase == .active
            )
            .frame(height: canvasHeight)
            .overlay(alignment: .bottom) {
                LinearGradient(
                    colors: [.clear, deepBg],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 120)
            }

            deepBg.frame(maxHeight: .infinity)
        }
        .ignoresSafeArea()
    }

    // MARK: - Content Router

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && !viewModel.forecast.available {
            loadingState
        } else if let error = viewModel.error, !viewModel.forecast.available {
            errorState(error)
        } else if viewModel.forecast.available {
            forecastScroll
        } else if !viewModel.isForecastWindowOpen {
            LockedForecastView(viewModel: viewModel)
        } else {
            unavailableState
        }
    }

    // MARK: - Forecast ScrollView

    private var forecastScroll: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.xl) {
                // ── Canvas spacer ──────────────────────────────────
                Color.clear.frame(height: 60)

                // ── Beach picker (floating on canvas) ─────────────
                BeachPicker(
                    beaches: viewModel.beaches,
                    selected: Binding(
                        get: { viewModel.selectedBeach },
                        set: { viewModel.selectBeach($0) }
                    )
                )

                // ── Score hero card ────────────────────────────────
                VStack(spacing: Spacing.lg) {
                    Text(beachDisplayName)
                        .font(.title3.weight(.semibold))

                    ScoreView(
                        score: viewModel.forecast.score,
                        verdict: viewModel.forecast.verdict
                    )

                    recommendationBadge

                    SunriseCountdownView(
                        countdownText: viewModel.sunriseCountdownText,
                        goldenHourText: viewModel.goldenHourDisplayText
                    )

                    weatherSummary
                }
                .frame(maxWidth: .infinity)
                .premiumCard()
                .scrollReveal(reduceMotion: reduceMotion)

                // ── AI Insights (THE CORE) ─────────────────────────
                InsightsSection(
                    insights: viewModel.forecast.insights,
                    beachName: beachDisplayName,
                    score: viewModel.forecast.score
                )
                .premiumCard()
                .scrollReveal(reduceMotion: reduceMotion)

                // ── Conditions ──────────────────────────────────────
                conditionsCard
                    .scrollReveal(reduceMotion: reduceMotion)

                // ── Score Breakdown ────────────────────────────────
                scoreBreakdownCard
                    .scrollReveal(reduceMotion: reduceMotion)

                // ── Photography ────────────────────────────────────
                photographyCard
                    .scrollReveal(reduceMotion: reduceMotion)

                // ── Nearby Beaches ─────────────────────────────────
                beachComparisonCard
                    .scrollReveal(reduceMotion: reduceMotion)

                // ── Subscribe ──────────────────────────────────────
                subscribeCard
                    .scrollReveal(reduceMotion: reduceMotion)

                Spacer().frame(height: Spacing.xxxl)
            }
        }
        .refreshable { await viewModel.refresh() }
        .sensoryFeedback(.impact(flexibility: .soft), trigger: viewModel.forecast.beach)
    }

    // MARK: - Section Cards

    private var conditionsCard: some View {
        let w = viewModel.forecast.weather
        let l = viewModel.forecast.labels
        let b = viewModel.forecast.breakdown
        let st = viewModel.forecast.sunTimes
        let gh = viewModel.forecast.goldenHour

        return VStack(alignment: .leading, spacing: Spacing.md) {
            SectionLabel(title: "Conditions", icon: "cloud.sun")

            condRow("cloud", "Cloud Cover", "\(w.cloudCover)%", l.cloudLabel)

            // Cloud layers H / M / L
            if b.multiLevelCloud.high > 0 || b.multiLevelCloud.mid > 0 || b.multiLevelCloud.low > 0 {
                HStack(spacing: Spacing.lg) {
                    cloudLayerPill("H", value: b.multiLevelCloud.high)
                    cloudLayerPill("M", value: b.multiLevelCloud.mid)
                    cloudLayerPill("L", value: b.multiLevelCloud.low)
                    Spacer()
                    if !l.cloudLayerLabel.isEmpty {
                        Text(l.cloudLayerLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(.leading, 34)
            }

            condRow("humidity", "Humidity", "\(w.humidity)%", l.humidityLabel)
            condRow("eye", "Visibility", fmtVis(w.visibility), l.visibilityLabel)
            condRow("wind", "Wind", "\(Int(w.windSpeed)) km/h \(w.windDirection)", l.windLabel)
            if !l.pressureLabel.isEmpty { condRow("gauge.medium", "Pressure", "", l.pressureLabel) }
            if !l.aodLabel.isEmpty { condRow("aqi.medium", "Aerosol", "", l.aodLabel) }

            if !st.sunRise.isEmpty || !st.sunSet.isEmpty || !gh.start.isEmpty {
                Divider().opacity(0.3).padding(.vertical, Spacing.sm)
                SectionLabel(title: "Sun & Moon", icon: "sun.and.horizon")

                if !st.sunRise.isEmpty { tRow("sunrise", "Sunrise", fmtTime(st.sunRise)) }
                if !st.sunSet.isEmpty { tRow("sunset", "Sunset", fmtTime(st.sunSet)) }
                if !gh.start.isEmpty {
                    tRow("sun.and.horizon", "Golden Hour", "\(fmtTime(gh.start)) – \(fmtTime(gh.end))")
                }
                if !st.moonPhase.isEmpty { tRow("moon", "Moon", fmtMoon(st.moonPhase)) }
            }
        }
        .premiumCard()
    }

    private var scoreBreakdownCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            SectionLabel(title: "Score Breakdown", icon: "chart.bar")
            ScoreBreakdownSection(
                breakdown: viewModel.forecast.breakdown,
                labels: viewModel.forecast.labels
            )
        }
        .premiumCard()
    }

    private var photographyCard: some View {
        Group {
            let p = viewModel.forecast.photography
            if p.dslr != nil || p.mobile != nil || !p.compositionTips.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    SectionLabel(title: "Photography", icon: "camera")
                    PhotographySection(photography: p)
                }
                .premiumCard()
            }
        }
    }

    private var beachComparisonCard: some View {
        Group {
            if !viewModel.forecast.comparison.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    SectionLabel(title: "Nearby Beaches", icon: "map")
                    BeachComparisonSection(comparisons: viewModel.forecast.comparison) { beachKey in
                        if let beach = viewModel.beaches.first(where: { $0.key == beachKey }) {
                            viewModel.selectBeach(beach)
                        }
                    }
                }
                .premiumCard()
            }
        }
    }

    private var subscribeCard: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            SectionLabel(title: "Stay Updated", icon: "bell")
            SubscribeSection(
                selectedBeach: viewModel.selectedBeach,
                beaches: viewModel.beaches
            )
            Text("Receive daily sunrise forecasts by email.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .premiumCard()
    }

    // MARK: - Cloud Layer Pill

    private func cloudLayerPill(_ label: String, value: Int) -> some View {
        HStack(spacing: Spacing.xs) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.tertiary)
            Text("\(value)%")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xxs + 1)
        .background(Color.white.opacity(0.04), in: Capsule())
    }

    // MARK: - Row Helpers

    private func condRow(_ icon: String, _ title: String, _ value: String, _ detail: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Label {
                Text(title).font(.subheadline)
            } icon: {
                Image(systemName: icon).foregroundStyle(.secondary).frame(width: 22)
            }
            Spacer(minLength: Spacing.lg)
            VStack(alignment: .trailing, spacing: Spacing.xxs) {
                if !value.isEmpty {
                    Text(value).font(.subheadline).monospacedDigit()
                }
                if !detail.isEmpty {
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                        .lineLimit(2).multilineTextAlignment(.trailing)
                }
            }
        }
    }

    private func tRow(_ icon: String, _ title: String, _ value: String) -> some View {
        HStack {
            Label { Text(title).font(.subheadline) } icon: {
                Image(systemName: icon).foregroundStyle(.secondary).frame(width: 22)
            }
            Spacer()
            Text(value).font(.subheadline)
        }
    }

    // MARK: - Helpers

    private var beachDisplayName: String {
        let name = viewModel.forecast.beachName
        return name.isEmpty ? viewModel.selectedBeach.name : name
    }

    @ViewBuilder
    private var recommendationBadge: some View {
        let badge = MaterialStyle.RecommendationBadge.forScore(viewModel.forecast.score)
        Label {
            Text(badge.text).font(.caption.weight(.medium))
        } icon: {
            Image(systemName: badge.icon).font(.caption)
        }
        .foregroundStyle(badge.color)
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.xs + 2)
        .background(Capsule().fill(badge.color.opacity(0.15)))
    }

    private var weatherSummary: some View {
        let w = viewModel.forecast.weather
        return VStack(spacing: Spacing.xs) {
            if w.temperature > 0 {
                Text("\(Int(w.temperature))°").font(.title2.weight(.medium)).monospacedDigit()
            }
            if !w.weatherDescription.isEmpty {
                Text(w.weatherDescription).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Formatting

    private static let isoFmt: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let isoFmt2: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]; return f
    }()
    private static let timeFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "Asia/Kolkata"); return f
    }()

    private func fmtTime(_ raw: String) -> String {
        if let d = Self.isoFmt.date(from: raw) ?? Self.isoFmt2.date(from: raw) {
            return Self.timeFmt.string(from: d)
        }
        return raw
    }

    private func fmtMoon(_ raw: String) -> String {
        var r = ""; for (i, c) in raw.enumerated() {
            if i > 0 && c.isUppercase { r.append(" ") }; r.append(c)
        }; return r
    }

    private func fmtVis(_ km: Double) -> String {
        km >= 10 ? "\(Int(km)) km" : String(format: "%.1f km", km)
    }

    // MARK: - Loading / Error / Unavailable

    private var loadingState: some View {
        VStack { Spacer(); ProgressView().controlSize(.large).tint(.white); Spacer() }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                Spacer().frame(height: canvasHeight - 80)
                ContentUnavailableView {
                    Label("Unable to Load", systemImage: "wifi.slash")
                } description: { Text(message) } actions: {
                    Button("Retry") { Task { await viewModel.loadForecast() } }.buttonStyle(.bordered)
                }
            }
        }
    }

    private var unavailableState: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                Spacer().frame(height: canvasHeight - 80)
                ContentUnavailableView {
                    Label("No Forecast", systemImage: "sun.horizon")
                } description: { Text("Forecast data isn't available yet. Pull to refresh.") }
            }
        }
    }
}

// MARK: - Scroll Reveal Animation

/// Fade-up reveal when a section scrolls into view.
private struct ScrollRevealModifier: ViewModifier {
    let reduceMotion: Bool
    @State private var isVisible = false

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : (reduceMotion ? 0 : 18))
            .onAppear {
                if reduceMotion {
                    isVisible = true
                } else {
                    withAnimation(.easeOut(duration: 0.45)) {
                        isVisible = true
                    }
                }
            }
    }
}

extension View {
    func scrollReveal(reduceMotion: Bool) -> some View {
        modifier(ScrollRevealModifier(reduceMotion: reduceMotion))
    }
}

#Preview {
    ForecastView(viewModel: ForecastViewModel())
        .preferredColorScheme(.dark)
}
