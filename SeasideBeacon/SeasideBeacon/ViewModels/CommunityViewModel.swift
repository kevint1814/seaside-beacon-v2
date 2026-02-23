import SwiftUI
import PhotosUI

@Observable
final class CommunityViewModel {

    // MARK: - Photo

    var selectedPhoto: PhotosPickerItem? {
        didSet {
            hasPhoto = selectedPhoto != nil
            if selectedPhoto != nil {
                loadPreview()
            } else {
                previewImage = nil
            }
        }
    }
    var hasPhoto = false
    var previewImage: Image?
    var isUploadingPhoto = false
    var photoMessage: String?

    private func loadPreview() {
        guard let item = selectedPhoto else { return }
        Task { @MainActor in
            if let data = try? await item.loadTransferable(type: Data.self),
               let uiImage = UIImage(data: data) {
                previewImage = Image(uiImage: uiImage)
            }
        }
    }

    func clearPhoto() {
        selectedPhoto = nil
        hasPhoto = false
        previewImage = nil
        photoMessage = nil
    }

    func submitPhoto() async {
        guard let item = selectedPhoto else { return }
        isUploadingPhoto = true
        photoMessage = nil

        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                photoMessage = "Could not load photo."
                isUploadingPhoto = false
                return
            }
            try await APIService.shared.submitPhoto(imageData: data, beach: "marina")
            photoMessage = "Photo submitted successfully!"
            clearPhoto()
        } catch {
            photoMessage = "Upload failed. Try again."
        }

        isUploadingPhoto = false
    }

    // MARK: - Feedback

    var rating: String?
    var feedbackBeach = "marina"
    var comment = ""
    var isSubmittingFeedback = false
    var feedbackMessage: String?

    func submitFeedback() async {
        guard let rating else { return }
        isSubmittingFeedback = true
        feedbackMessage = nil

        do {
            try await APIService.shared.submitFeedback(
                rating: rating,
                beach: feedbackBeach,
                comment: comment.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            feedbackMessage = "Thank you for your feedback!"
            self.rating = nil
            comment = ""
        } catch {
            feedbackMessage = "Failed to submit. Try again."
        }

        isSubmittingFeedback = false
    }
}
