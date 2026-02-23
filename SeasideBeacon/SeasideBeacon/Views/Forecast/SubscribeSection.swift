import SwiftUI

/// Inline email subscribe form — self-contained state.
/// Reused in both the locked state and the forecast List.
struct SubscribeSection: View {
    let selectedBeach: Beach
    let beaches: [Beach]

    @State private var email = ""
    @State private var isSubmitting = false
    @State private var resultMessage: String?
    @State private var isSuccess = false
    @FocusState private var isEmailFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Get Notified")
                .font(.headline)

            Text("Evening preview at 8:30 PM, final forecast at 4 AM IST.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Email field
            TextField("your@email.com", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .focused($isEmailFocused)
                .submitLabel(.done)
                .onSubmit { isEmailFocused = false }
                .padding(Spacing.md)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))

            // Subscribe button
            Button {
                Task { await subscribe() }
            } label: {
                HStack(spacing: Spacing.sm) {
                    if isSubmitting {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.white)
                    }
                    Text("Subscribe \u{2014} Free")
                        .font(.subheadline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.md)
                .background(MaterialStyle.accent)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(isSubmitting || email.trimmingCharacters(in: .whitespaces).isEmpty)

            // Result message
            if let message = resultMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(isSuccess ? .green : .red)
            }

            // Privacy note
            Text("No spam. Unsubscribe anytime.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    // MARK: - Subscribe

    private func subscribe() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.contains("@") else {
            resultMessage = "Please enter a valid email."
            isSuccess = false
            return
        }

        isEmailFocused = false
        isSubmitting = true
        resultMessage = nil

        do {
            try await APIService.shared.subscribe(email: trimmed, beach: selectedBeach.key)
            resultMessage = "Subscribed! Preview tonight at 8:30 PM."
            isSuccess = true
            email = ""
        } catch {
            resultMessage = "Failed to subscribe. Try again."
            isSuccess = false
        }

        isSubmitting = false
    }
}
