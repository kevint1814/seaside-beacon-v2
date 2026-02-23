import Foundation

// MARK: - Top-Level Response

/// Full forecast from GET /api/predict/:beach.
/// The API wraps everything in `{ success, data: { weather, photography, comparison } }`.
struct Forecast: Sendable {
    let available: Bool
    let beach: String
    let beachName: String
    let score: Int
    let verdict: String
    let recommendation: String
    let weather: Weather
    let breakdown: ScoreBreakdown
    let labels: AtmosphericLabels
    let goldenHour: GoldenHour
    let sunTimes: SunTimes
    let insights: Insights
    let photography: Photography
    let comparison: [BeachComparison]
}

// MARK: - Custom Decoding (matches nested API shape)

extension Forecast: Decodable {
    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: RootKeys.self)

        // Unwrap `data` envelope if present
        let data: KeyedDecodingContainer<DataKeys>
        if let nested = try? root.nestedContainer(keyedBy: DataKeys.self, forKey: .data) {
            data = nested
        } else {
            // Flat shape fallback
            data = try decoder.container(keyedBy: DataKeys.self)
        }

        // weather object
        let w = try data.nestedContainer(keyedBy: WeatherKeys.self, forKey: .weather)
        available = (try? w.decode(Bool.self, forKey: .available)) ?? false
        beach = (try? w.decode(String.self, forKey: .beach)) ?? ""
        beachName = (try? w.decode(String.self, forKey: .beachName)) ?? ""

        weather = (try? w.decode(Weather.self, forKey: .forecast)) ?? .empty
        goldenHour = (try? w.decode(GoldenHour.self, forKey: .goldenHour)) ?? .empty
        sunTimes = (try? w.decode(SunTimes.self, forKey: .sunTimes)) ?? .empty

        // prediction (nested inside weather)
        let pred = try? w.nestedContainer(keyedBy: PredictionKeys.self, forKey: .prediction)
        score = (try? pred?.decode(Int.self, forKey: .score)) ?? 0
        verdict = (try? pred?.decode(String.self, forKey: .verdict)) ?? ""
        recommendation = (try? pred?.decode(String.self, forKey: .recommendation)) ?? ""
        breakdown = (try? pred?.decode(ScoreBreakdown.self, forKey: .breakdown)) ?? .empty
        labels = (try? pred?.decode(AtmosphericLabels.self, forKey: .atmosphericLabels)) ?? .empty

        // insights — the API puts source/greeting/insight/sunriseExperience
        // at the TOP LEVEL of the photography object (not under a nested "insights" key).
        // Try decoding photography itself as Insights first, then prediction.insights fallback.
        if let photoInsights = try? data.decode(Insights.self, forKey: .photography) {
            insights = photoInsights
        } else if let predInsights = try? pred?.decode(Insights.self, forKey: .insights) {
            insights = predInsights
        } else {
            insights = .empty
        }

        // photography
        photography = (try? data.decode(Photography.self, forKey: .photography)) ?? .empty

        // comparison
        comparison = (try? data.decode([BeachComparison].self, forKey: .comparison)) ?? []
    }

    private enum RootKeys: String, CodingKey { case data }
    private enum DataKeys: String, CodingKey { case weather, photography, comparison }
    private enum WeatherKeys: String, CodingKey {
        case available, beach, beachName, forecast, prediction, goldenHour, sunTimes, dataSources
    }
    private enum PredictionKeys: String, CodingKey {
        case score, verdict, recommendation, breakdown, atmosphericLabels, insights
    }
    private enum PhotographyRootKeys: String, CodingKey { case insights, settings, compositionTips, proTips }
}

extension Forecast {
    static let empty = Forecast(
        available: false, beach: "", beachName: "", score: 0,
        verdict: "", recommendation: "",
        weather: .empty, breakdown: .empty, labels: .empty,
        goldenHour: .empty, sunTimes: .empty, insights: .empty,
        photography: .empty, comparison: []
    )
}

// MARK: - Weather

struct Weather: Decodable, Sendable {
    let temperature: Double
    let cloudCover: Int
    let humidity: Int
    let visibility: Double
    let windSpeed: Double
    let windDirection: String
    let precipProbability: Int
    let uvIndex: Int
    let weatherDescription: String
    let forecastTime: String

    static let empty = Weather(
        temperature: 0, cloudCover: 0, humidity: 0, visibility: 0,
        windSpeed: 0, windDirection: "", precipProbability: 0,
        uvIndex: 0, weatherDescription: "", forecastTime: ""
    )
}

// MARK: - Score Breakdown

struct ScoreBreakdown: Sendable {
    let cloudCover: FactorScore
    let multiLevelCloud: MultiLevelCloud
    let humidity: FactorScore
    let pressureTrend: PressureScore
    let aod: FactorScore
    let visibility: FactorScore
    let weather: FactorScore
    let wind: FactorScore
    let synergy: Int
    let postRainBonus: Int
    let isPostRain: Bool
    let solarBonus: Int

    static let empty = ScoreBreakdown(
        cloudCover: .empty, multiLevelCloud: .empty, humidity: .empty,
        pressureTrend: .empty, aod: .empty, visibility: .empty,
        weather: .empty, wind: .empty,
        synergy: 0, postRainBonus: 0, isPostRain: false, solarBonus: 0
    )
}

extension ScoreBreakdown: Decodable {}

struct FactorScore: Decodable, Sendable {
    let value: Double
    let score: Int
    let maxScore: Int

    var ratio: Double { maxScore > 0 ? Double(score) / Double(maxScore) : 0 }

    static let empty = FactorScore(value: 0, score: 0, maxScore: 0)
}

struct MultiLevelCloud: Decodable, Sendable {
    let high: Int
    let mid: Int
    let low: Int
    let score: Int
    let maxScore: Int

    var ratio: Double { maxScore > 0 ? Double(score) / Double(maxScore) : 0 }

    static let empty = MultiLevelCloud(high: 0, mid: 0, low: 0, score: 0, maxScore: 0)
}

struct PressureScore: Decodable, Sendable {
    let value: Double
    let pressureMsl: Double
    let score: Int
    let maxScore: Int

    var ratio: Double { maxScore > 0 ? Double(score) / Double(maxScore) : 0 }

    static let empty = PressureScore(value: 0, pressureMsl: 0, score: 0, maxScore: 0)

    private enum CodingKeys: String, CodingKey {
        case value, pressureMsl, score, maxScore
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        value = (try? c.decode(Double.self, forKey: .value)) ?? 0
        pressureMsl = (try? c.decode(Double.self, forKey: .pressureMsl)) ?? 0
        score = (try? c.decode(Int.self, forKey: .score)) ?? 0
        maxScore = (try? c.decode(Int.self, forKey: .maxScore)) ?? 0
    }

    init(value: Double, pressureMsl: Double, score: Int, maxScore: Int) {
        self.value = value
        self.pressureMsl = pressureMsl
        self.score = score
        self.maxScore = maxScore
    }
}

// MARK: - Atmospheric Labels

struct AtmosphericLabels: Decodable, Sendable {
    let cloudLabel: String
    let cloudLayerLabel: String
    let humidityLabel: String
    let pressureLabel: String
    let aodLabel: String
    let visibilityLabel: String
    let windLabel: String

    static let empty = AtmosphericLabels(
        cloudLabel: "", cloudLayerLabel: "", humidityLabel: "",
        pressureLabel: "", aodLabel: "", visibilityLabel: "", windLabel: ""
    )
}

// MARK: - Golden Hour & Sun Times

struct GoldenHour: Decodable, Sendable {
    let start: String
    let end: String

    static let empty = GoldenHour(start: "", end: "")
}

struct SunTimes: Decodable, Sendable {
    let sunRise: String
    let sunSet: String
    let moonPhase: String

    static let empty = SunTimes(sunRise: "", sunSet: "", moonPhase: "")
}

// MARK: - Insights

struct Insights: Sendable {
    let source: String
    let greeting: String
    let insight: String
    let whatYoullSee: String
    let beachVibes: String
    let worthWakingUp: String

    static let empty = Insights(
        source: "", greeting: "", insight: "",
        whatYoullSee: "", beachVibes: "", worthWakingUp: ""
    )
}

extension Insights: Decodable {
    private enum CodingKeys: String, CodingKey {
        case source, greeting, insight, whatYoullSee, beachVibes, worthWakingUp, sunriseExperience
    }

    private enum ExperienceKeys: String, CodingKey {
        case insight, whatYoullSee, beachVibes, worthWakingUp
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        source = (try? c.decode(String.self, forKey: .source)) ?? "rules"
        greeting = (try? c.decode(String.self, forKey: .greeting)) ?? ""

        // Try top-level fields first, then fall back to sunriseExperience nested object
        let exp = try? c.nestedContainer(keyedBy: ExperienceKeys.self, forKey: .sunriseExperience)

        let topInsight = try? c.decode(String.self, forKey: .insight)
        insight = (topInsight?.isEmpty == false ? topInsight : try? exp?.decode(String.self, forKey: .insight)) ?? ""

        let topSee = try? c.decode(String.self, forKey: .whatYoullSee)
        whatYoullSee = (topSee?.isEmpty == false ? topSee : try? exp?.decode(String.self, forKey: .whatYoullSee)) ?? ""

        let topVibes = try? c.decode(String.self, forKey: .beachVibes)
        beachVibes = (topVibes?.isEmpty == false ? topVibes : try? exp?.decode(String.self, forKey: .beachVibes)) ?? ""

        let topWorth = try? c.decode(String.self, forKey: .worthWakingUp)
        worthWakingUp = (topWorth?.isEmpty == false ? topWorth : try? exp?.decode(String.self, forKey: .worthWakingUp)) ?? ""
    }
}

// MARK: - Photography

struct Photography: Sendable {
    let dslr: CameraSettings?
    let mobile: CameraSettings?
    let compositionTips: [String]
    let proTips: [String]

    static let empty = Photography(dslr: nil, mobile: nil, compositionTips: [], proTips: [])
}

extension Photography: Decodable {
    private enum CodingKeys: String, CodingKey { case settings, compositionTips, proTips, insights }
    private enum SettingsKeys: String, CodingKey { case dslr, mobile }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        compositionTips = (try? c.decode([String].self, forKey: .compositionTips)) ?? []
        proTips = (try? c.decode([String].self, forKey: .proTips)) ?? []

        if let settings = try? c.nestedContainer(keyedBy: SettingsKeys.self, forKey: .settings) {
            dslr = try? settings.decode(CameraSettings.self, forKey: .dslr)
            mobile = try? settings.decode(CameraSettings.self, forKey: .mobile)
        } else {
            dslr = nil
            mobile = nil
        }
    }
}

struct CameraSettings: Decodable, Sendable {
    let iso: String
    let aperture: String
    let shutterSpeed: String
    let whiteBalance: String
    let focusMode: String

    private enum CodingKeys: String, CodingKey {
        case iso, aperture, shutterSpeed, whiteBalance, focusMode
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        iso = (try? c.decode(StringOrNumber.self, forKey: .iso))?.string ?? ""
        aperture = (try? c.decode(StringOrNumber.self, forKey: .aperture))?.string ?? ""
        shutterSpeed = (try? c.decode(StringOrNumber.self, forKey: .shutterSpeed))?.string ?? ""
        whiteBalance = (try? c.decode(StringOrNumber.self, forKey: .whiteBalance))?.string ?? ""
        focusMode = (try? c.decode(StringOrNumber.self, forKey: .focusMode))?.string ?? ""
    }
}

/// Handles API fields that may be String or Number.
private enum StringOrNumber: Decodable {
    case string(String)
    case number(Double)

    var string: String {
        switch self {
        case .string(let s): return s
        case .number(let n): return n.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(n)) : String(n)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) {
            self = .string(s)
        } else if let n = try? container.decode(Double.self) {
            self = .number(n)
        } else {
            self = .string("")
        }
    }
}

// MARK: - Beach Comparison

struct BeachComparison: Decodable, Identifiable, Sendable {
    let beach: String
    let beachName: String
    let score: Int
    let verdict: String
    let recommendation: String

    var id: String { beach }
}
