import SwiftUI

@Observable
final class SettingsViewModel {

    // MARK: - Notifications (stored + UserDefaults sync)

    var muteAll: Bool = UserDefaults.standard.bool(forKey: "muteAll") {
        didSet { UserDefaults.standard.set(muteAll, forKey: "muteAll") }
    }

    var morningEnabled: Bool = !UserDefaults.standard.bool(forKey: "muteMorning") {
        didSet { UserDefaults.standard.set(!morningEnabled, forKey: "muteMorning") }
    }

    var eveningEnabled: Bool = !UserDefaults.standard.bool(forKey: "muteEvening") {
        didSet { UserDefaults.standard.set(!eveningEnabled, forKey: "muteEvening") }
    }

    // MARK: - Default Beach

    var defaultBeach: String = UserDefaults.standard.string(forKey: "defaultBeach") ?? "marina" {
        didSet { UserDefaults.standard.set(defaultBeach, forKey: "defaultBeach") }
    }

    // MARK: - Email

    var email = ""
    var isSubscribing = false
    var emailMessage: String?

    func subscribe() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.contains("@") else {
            emailMessage = "Please enter a valid email."
            return
        }
        isSubscribing = true
        emailMessage = nil

        do {
            try await APIService.shared.subscribe(email: trimmed, beach: defaultBeach)
            emailMessage = "Subscribed successfully!"
        } catch {
            emailMessage = "Failed to subscribe. Try again."
        }

        isSubscribing = false
    }

    func unsubscribe() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.contains("@") else {
            emailMessage = "Please enter a valid email."
            return
        }
        isSubscribing = true
        emailMessage = nil

        do {
            try await APIService.shared.unsubscribe(email: trimmed)
            emailMessage = "Unsubscribed. We'll miss you."
        } catch {
            emailMessage = "Failed to unsubscribe. Try again."
        }

        isSubscribing = false
    }
}
