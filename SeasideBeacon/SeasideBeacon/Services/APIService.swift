import Foundation

/// Lightweight API client — URLSession + async/await, no third-party deps.
actor APIService {

    static let shared = APIService()

    private let baseURL = URL(string: "https://api.seasidebeacon.com")!
    private let session: URLSession
    private let decoder: JSONDecoder

    // Simple in-memory cache
    private var cache: [String: CacheEntry] = [:]
    private struct CacheEntry {
        let data: Data
        let timestamp: Date
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 30
        config.waitsForConnectivity = true
        session = URLSession(configuration: config)
        decoder = JSONDecoder()
    }

    // MARK: - Beaches

    func fetchBeaches() async throws -> [Beach] {
        let data = try await fetch(path: "/api/beaches", cacheDuration: 300)
        let response = try decoder.decode(BeachesResponse.self, from: data)
        return response.beaches
    }

    private struct BeachesResponse: Decodable {
        let beaches: [Beach]
    }

    // MARK: - Forecast

    func fetchForecast(for beachKey: String) async throws -> Forecast {
        let data = try await fetch(path: "/api/predict/\(beachKey)", cacheDuration: 600)
        return try decoder.decode(Forecast.self, from: data)
    }

    // MARK: - Email Subscription

    func subscribe(email: String, beach: String) async throws {
        try await post(path: "/api/subscribe", body: ["email": email, "preferredBeach": beach])
    }

    func unsubscribe(email: String) async throws {
        try await post(path: "/api/unsubscribe", body: ["email": email])
    }

    // MARK: - Feedback

    func submitFeedback(rating: String, beach: String, comment: String) async throws {
        var body: [String: String] = ["rating": rating, "beach": beach]
        if !comment.isEmpty { body["comment"] = comment }
        try await post(path: "/api/feedback", body: body)
    }

    // MARK: - Photo Upload

    func submitPhoto(imageData: Data, beach: String) async throws {
        let url = baseURL.appendingPathComponent("/api/sunrise-submission")
        let boundary = UUID().uuidString

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        // Beach field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"beach\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(beach)\r\n".data(using: .utf8)!)

        // Date field
        let dateStr = ISO8601DateFormatter().string(from: Date()).prefix(10)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"date\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(dateStr)\r\n".data(using: .utf8)!)

        // Image
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"photo\"; filename=\"sunrise.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }
    }

    // MARK: - Device Registration

    func registerDevice(token: String, platform: String = "ios") async throws {
        try await post(path: "/api/register-device", body: ["token": token, "platform": platform])
    }

    // MARK: - Core Fetch

    private func fetch(path: String, cacheDuration: TimeInterval) async throws -> Data {
        if let entry = cache[path],
           Date().timeIntervalSince(entry.timestamp) < cacheDuration {
            return entry.data
        }

        let url = baseURL.appendingPathComponent(path)
        let (data, response) = try await session.data(from: url)

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }

        cache[path] = CacheEntry(data: data, timestamp: Date())
        return data
    }

    // MARK: - Core Post

    @discardableResult
    private func post(path: String, body: [String: String]) async throws -> Data {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.badResponse
        }
        return data
    }

    /// Clear all cached data.
    func clearCache() {
        cache.removeAll()
    }

    /// Clear cache for a specific path.
    func clearCacheForPath(_ path: String) {
        cache.removeValue(forKey: path)
    }
}

enum APIError: LocalizedError {
    case badResponse

    var errorDescription: String? {
        switch self {
        case .badResponse: return "Unable to reach Seaside Beacon. Check your connection."
        }
    }
}
