import Foundation

struct Beach: Identifiable, Hashable, Sendable {
    let key: String
    let name: String
    let latitude: Double
    let longitude: Double
    let context: String

    var id: String { key }
}

// MARK: - Codable (matches GET /api/beaches)

extension Beach: Decodable {
    private enum CodingKeys: String, CodingKey {
        case key, name, coordinates, context
    }

    private enum CoordinateKeys: String, CodingKey {
        case lat, lon
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decodeIfPresent(String.self, forKey: .key) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        context = try container.decodeIfPresent(String.self, forKey: .context) ?? ""

        if let coords = try? container.nestedContainer(keyedBy: CoordinateKeys.self, forKey: .coordinates) {
            latitude = try coords.decodeIfPresent(Double.self, forKey: .lat) ?? 0
            longitude = try coords.decodeIfPresent(Double.self, forKey: .lon) ?? 0
        } else {
            latitude = 0
            longitude = 0
        }
    }
}

// MARK: - Hardcoded Defaults (offline fallback)

extension Beach {
    static let defaults: [Beach] = [
        Beach(
            key: "marina",
            name: "Marina Beach",
            latitude: 13.0500,
            longitude: 80.2824,
            context: "Historic lighthouse, fishing boats at dawn, long sandy stretch"
        ),
        Beach(
            key: "elliot",
            name: "Elliot's Beach",
            latitude: 12.9988,
            longitude: 80.2717,
            context: "Karl Schmidt memorial, Ashtalakshmi temple silhouette, rocky southern end"
        ),
        Beach(
            key: "covelong",
            name: "Covelong Beach",
            latitude: 12.7892,
            longitude: 80.2528,
            context: "Surf point, rocky outcrops, fishing village, surfboard racks on sand"
        ),
        Beach(
            key: "thiruvanmiyur",
            name: "Thiruvanmiyur Beach",
            latitude: 12.9830,
            longitude: 80.2650,
            context: "Tidal pools, Broken Bridge ruins, quiet morning walkers, kite flyers"
        ),
    ]
}
