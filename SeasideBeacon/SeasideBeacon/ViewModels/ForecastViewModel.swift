import SwiftUI

@Observable
final class ForecastViewModel {

    // MARK: - State

    var beaches: [Beach] = Beach.defaults
    var selectedBeach: Beach = Beach.defaults[0]
    var forecast: Forecast = .empty
    var isLoading = false
    var error: String?

    // MARK: - Availability Gate (IST)

    /// Whether the forecast window is open (6 PM – 7 AM IST).
    var isForecastWindowOpen: Bool = false

    /// Formatted countdown to 6 PM IST, e.g. "5h 32m"
    var countdownText: String = ""

    /// Progress through the locked period (0.0 at 7 AM, 1.0 at 6 PM).
    var countdownProgress: Double = 0

    private var countdownTimer: Timer?

    // MARK: - Sunrise Countdown

    /// "Sunrise in 8h 22m" — nil if sunrise has passed or can't be parsed.
    var sunriseCountdownText: String?

    /// "Golden hour 5:42 AM – 6:08 AM"
    var goldenHourDisplayText: String?

    private var sunriseTimer: Timer?

    // MARK: - IST Timezone

    private static let istTimeZone = TimeZone(identifier: "Asia/Kolkata")!

    // MARK: - Lifecycle

    deinit {
        countdownTimer?.invalidate()
        sunriseTimer?.invalidate()
    }

    // MARK: - Load Beaches

    func loadBeaches() async {
        do {
            let fetched = try await APIService.shared.fetchBeaches()
            if !fetched.isEmpty {
                beaches = fetched
                if !fetched.contains(where: { $0.key == selectedBeach.key }) {
                    selectedBeach = fetched[0]
                }
            }
        } catch {
            // Silently fall back to defaults
        }
    }

    // MARK: - Load Forecast

    func loadForecast() async {
        checkAvailability()

        guard isForecastWindowOpen else { return }

        isLoading = true
        error = nil

        do {
            forecast = try await APIService.shared.fetchForecast(for: selectedBeach.key)
        } catch {
            self.error = error.localizedDescription
            forecast = .empty
        }

        isLoading = false
        updateSunriseCountdown()
    }

    // MARK: - Beach Selection

    func selectBeach(_ beach: Beach) {
        guard beach.key != selectedBeach.key else { return }
        selectedBeach = beach
        // Clear stale cache for the new beach so fresh data loads
        Task {
            await APIService.shared.clearCacheForPath("/api/predict/\(beach.key)")
            await loadForecast()
        }
    }

    // MARK: - Refresh

    func refresh() async {
        checkAvailability()

        if isForecastWindowOpen {
            await APIService.shared.clearCache()
            await loadForecast()
        }
    }

    // MARK: - Availability Check

    func checkAvailability() {
        let now = Date()
        let components = Calendar.current.dateComponents(
            in: Self.istTimeZone, from: now
        )
        guard let hour = components.hour else { return }

        let wasOpen = isForecastWindowOpen
        isForecastWindowOpen = hour >= 18 || hour < 7

        if !isForecastWindowOpen {
            computeCountdown(from: now, istComponents: components)
            startCountdownTimer()
        } else {
            stopCountdownTimer()
            countdownText = ""

            // Auto-fetch when gate just opened
            if !wasOpen && !forecast.available {
                Task { await loadForecast() }
            }
        }
    }

    private func computeCountdown(from now: Date, istComponents: DateComponents) {
        guard let hour = istComponents.hour, let minute = istComponents.minute else { return }

        // Target: 6 PM (18:00) IST today
        let hoursLeft = 17 - hour
        let minutesLeft = 60 - minute

        if minutesLeft == 60 {
            countdownText = "\(hoursLeft + 1)h"
        } else {
            countdownText = "\(hoursLeft)h \(minutesLeft)m"
        }

        // Progress: 7 AM (420 min) → 6 PM (1080 min) = 660 min total
        let totalMinutes = 660.0
        let minutesSince7AM = Double((hour - 7) * 60 + minute)
        countdownProgress = max(0, min(1, minutesSince7AM / totalMinutes))
    }

    private func startCountdownTimer() {
        guard countdownTimer == nil else { return }
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.checkAvailability()
        }
    }

    private func stopCountdownTimer() {
        countdownTimer?.invalidate()
        countdownTimer = nil
    }

    // MARK: - Sunrise Countdown

    func updateSunriseCountdown() {
        guard forecast.available,
              !forecast.sunTimes.sunRise.isEmpty else {
            sunriseCountdownText = nil
            goldenHourDisplayText = nil
            stopSunriseTimer()
            return
        }

        // Parse sunrise time
        guard let sunriseDate = Self.parseISO8601(forecast.sunTimes.sunRise) else {
            sunriseCountdownText = nil
            return
        }

        let now = Date()
        let diff = Int(sunriseDate.timeIntervalSince(now))

        if diff > 0 {
            let hours = diff / 3600
            let minutes = (diff % 3600) / 60
            sunriseCountdownText = hours > 0 ? "Sunrise in \(hours)h \(minutes)m" : "Sunrise in \(minutes)m"
            startSunriseTimer()
        } else {
            sunriseCountdownText = nil
            stopSunriseTimer()
        }

        // Golden hour display
        if !forecast.goldenHour.start.isEmpty, !forecast.goldenHour.end.isEmpty {
            let start = Self.formatTimeIST(forecast.goldenHour.start)
            let end = Self.formatTimeIST(forecast.goldenHour.end)
            goldenHourDisplayText = "Golden hour \(start) \u{2013} \(end)"
        } else {
            goldenHourDisplayText = nil
        }
    }

    private func startSunriseTimer() {
        guard sunriseTimer == nil else { return }
        sunriseTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.updateSunriseCountdown()
        }
    }

    private func stopSunriseTimer() {
        sunriseTimer?.invalidate()
        sunriseTimer = nil
    }

    // MARK: - ISO 8601 Parsing (shared)

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFallback: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "Asia/Kolkata")
        return f
    }()

    static func parseISO8601(_ raw: String) -> Date? {
        isoFormatter.date(from: raw) ?? isoFallback.date(from: raw)
    }

    static func formatTimeIST(_ raw: String) -> String {
        if let date = parseISO8601(raw) {
            return timeFormatter.string(from: date)
        }
        return raw
    }
}
