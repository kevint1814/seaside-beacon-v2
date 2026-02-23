import SwiftUI

/// Weather conditions and sun/moon times.
/// Clean rows, native list style, consistent value alignment.
struct ConditionsSection: View {
    let weather: Weather
    let labels: AtmosphericLabels
    let sunTimes: SunTimes
    let goldenHour: GoldenHour

    var body: some View {
        Section {
            conditionRow(
                icon: "cloud",
                title: "Cloud Cover",
                value: "\(weather.cloudCover)%",
                detail: labels.cloudLabel,
                valueColor: cloudColor(weather.cloudCover)
            )
            conditionRow(
                icon: "humidity",
                title: "Humidity",
                value: "\(weather.humidity)%",
                detail: labels.humidityLabel,
                valueColor: humidityColor(weather.humidity)
            )
            conditionRow(
                icon: "eye",
                title: "Visibility",
                value: formatVisibility(weather.visibility),
                detail: labels.visibilityLabel,
                valueColor: visibilityColor(weather.visibility)
            )
            conditionRow(
                icon: "wind",
                title: "Wind",
                value: "\(Int(weather.windSpeed)) km/h \(weather.windDirection)",
                detail: labels.windLabel,
                valueColor: windColor(weather.windSpeed)
            )
            if !labels.pressureLabel.isEmpty {
                conditionRow(
                    icon: "gauge.medium",
                    title: "Pressure",
                    value: "",
                    detail: labels.pressureLabel
                )
            }
            if !labels.aodLabel.isEmpty {
                conditionRow(
                    icon: "aqi.medium",
                    title: "Aerosol",
                    value: "",
                    detail: labels.aodLabel
                )
            }
        } header: {
            Text("Conditions")
        }

        if hasSunData {
            Section {
                if !sunTimes.sunRise.isEmpty {
                    timeRow(icon: "sunrise", title: "Sunrise", value: formatTime(sunTimes.sunRise))
                }
                if !sunTimes.sunSet.isEmpty {
                    timeRow(icon: "sunset", title: "Sunset", value: formatTime(sunTimes.sunSet))
                }
                if !goldenHour.start.isEmpty {
                    timeRow(
                        icon: "sun.and.horizon",
                        title: "Golden Hour",
                        value: "\(formatTime(goldenHour.start)) – \(formatTime(goldenHour.end))"
                    )
                }
                if !sunTimes.moonPhase.isEmpty {
                    timeRow(icon: "moon", title: "Moon", value: formatMoonPhase(sunTimes.moonPhase))
                }
            } header: {
                Text("Sun & Moon")
            }
        }
    }

    // MARK: - Rows

    private func conditionRow(icon: String, title: String, value: String, detail: String, valueColor: Color? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Label {
                Text(title)
            } icon: {
                Image(systemName: icon)
                    .foregroundStyle(.secondary)
                    .frame(width: 22)
            }

            Spacer(minLength: Spacing.lg)

            VStack(alignment: .trailing, spacing: Spacing.xxs) {
                if !value.isEmpty {
                    Text(value)
                        .monospacedDigit()
                        .foregroundStyle(valueColor ?? .primary)
                }
                if !detail.isEmpty {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .glassRow()
    }

    // MARK: - Condition Colors (sunrise favorability)

    /// Cloud cover sweet spot: 30–60% is ideal for dramatic skies.
    private func cloudColor(_ pct: Int) -> Color {
        switch pct {
        case 30...60: return .green
        case 20..<30, 61...80: return .orange
        default: return .red
        }
    }

    /// Lower humidity = crisper, more saturated colors.
    private func humidityColor(_ pct: Int) -> Color {
        switch pct {
        case 0..<50: return .green
        case 50..<70: return .orange
        default: return .red
        }
    }

    /// Higher visibility = sharper sunrise.
    private func visibilityColor(_ km: Double) -> Color {
        switch km {
        case 10...: return .green
        case 5..<10: return .orange
        default: return .red
        }
    }

    /// Calmer wind = cleaner reflections and steadier photography.
    private func windColor(_ speed: Double) -> Color {
        switch speed {
        case 0..<15: return .green
        case 15..<25: return .orange
        default: return .red
        }
    }

    private func timeRow(icon: String, title: String, value: String) -> some View {
        HStack {
            Label {
                Text(title)
            } icon: {
                Image(systemName: icon)
                    .foregroundStyle(.secondary)
                    .frame(width: 22)
            }
            Spacer()
            Text(value)
                .foregroundStyle(.primary)
        }
        .glassRow()
    }

    // MARK: - Formatting

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

    /// Parses ISO 8601 timestamps like "2026-02-21T00:59:00.000Z"
    /// and returns local time like "6:29 AM" (IST).
    /// If the string is already formatted (e.g. "6:09 AM"), returns it as-is.
    private func formatTime(_ raw: String) -> String {
        // Try ISO 8601 parsing
        if let date = Self.isoFormatter.date(from: raw) ?? Self.isoFallback.date(from: raw) {
            return Self.timeFormatter.string(from: date)
        }
        // Already a readable string — return as-is
        return raw
    }

    /// Converts "WaxingCrescent" → "Waxing Crescent"
    private func formatMoonPhase(_ raw: String) -> String {
        // Insert space before each uppercase letter (except the first)
        var result = ""
        for (i, char) in raw.enumerated() {
            if i > 0 && char.isUppercase {
                result.append(" ")
            }
            result.append(char)
        }
        return result
    }

    private var hasSunData: Bool {
        !sunTimes.sunRise.isEmpty || !sunTimes.sunSet.isEmpty || !goldenHour.start.isEmpty
    }

    private func formatVisibility(_ km: Double) -> String {
        km >= 10 ? "\(Int(km)) km" : String(format: "%.1f km", km)
    }
}
