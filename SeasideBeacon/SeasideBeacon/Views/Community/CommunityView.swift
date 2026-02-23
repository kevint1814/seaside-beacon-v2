import SwiftUI
import PhotosUI

/// Community tab — photo submission and forecast feedback.
/// Visual polish: accent bars, styled buttons, expand indicator on photos.
struct CommunityView: View {
    @State private var viewModel = CommunityViewModel()
    @State private var showingFullPhoto = false
    @FocusState private var isCommentFocused: Bool

    var body: some View {
        NavigationStack {
            List {
                // Photo submission
                Section {
                    PhotosPicker(selection: $viewModel.selectedPhoto, matching: .images) {
                        Label(
                            viewModel.hasPhoto ? "Change Photo" : "Select Sunrise Photo",
                            systemImage: viewModel.hasPhoto ? "photo.fill" : "photo.on.rectangle.angled"
                        )
                    }
                    .glassRow()

                    if viewModel.hasPhoto {
                        // Photo preview
                        if let preview = viewModel.previewImage {
                            preview
                                .resizable()
                                .scaledToFill()
                                .frame(maxWidth: .infinity)
                                .frame(height: 200)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .expandableOverlay()
                                .contentShape(Rectangle())
                                .onTapGesture { showingFullPhoto = true }
                                .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
                                .glassRow()
                        }

                        HStack {
                            Text("Ready to submit")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("Remove") {
                                viewModel.clearPhoto()
                            }
                            .foregroundStyle(.red)
                            .font(.subheadline)
                        }
                        .glassRow()

                        Button {
                            Task { await viewModel.submitPhoto() }
                        } label: {
                            HStack(spacing: Spacing.sm) {
                                if viewModel.isUploadingPhoto {
                                    ProgressView()
                                        .controlSize(.small)
                                        .tint(.white)
                                }
                                Text("Submit Photo")
                                    .font(.subheadline.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.md)
                            .background(MaterialStyle.accent)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .disabled(viewModel.isUploadingPhoto)
                        .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
                        .glassRow()
                    }

                    if let msg = viewModel.photoMessage {
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(msg.contains("success") ? .green : .red)
                            .glassRow()
                    }
                } header: {
                    Text("Share Your Sunrise").premiumSectionHeader()
                } footer: {
                    Text("Photos help us validate our predictions and build a community archive.").premiumSectionFooter()
                }

                // Feedback
                Section {
                    Picker("How was the forecast?", selection: $viewModel.rating) {
                        Text("Select").tag(nil as String?)
                        Text("Spot On").tag("spot-on" as String?)
                        Text("Close").tag("close" as String?)
                        Text("Missed").tag("missed" as String?)
                    }
                    .glassRow()

                    Picker("Beach", selection: $viewModel.feedbackBeach) {
                        ForEach(Beach.defaults) { beach in
                            Text(beach.name).tag(beach.key)
                        }
                    }
                    .glassRow()

                    TextField("Optional comment...", text: $viewModel.comment, axis: .vertical)
                        .lineLimit(3...6)
                        .focused($isCommentFocused)
                        .glassRow()

                    Button {
                        isCommentFocused = false
                        Task { await viewModel.submitFeedback() }
                    } label: {
                        HStack(spacing: Spacing.sm) {
                            if viewModel.isSubmittingFeedback {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            }
                            Text("Submit Feedback")
                                .font(.subheadline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(viewModel.rating == nil ? Color.white.opacity(0.04) : MaterialStyle.accent)
                        .foregroundStyle(viewModel.rating == nil ? Color.secondary : Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.rating == nil || viewModel.isSubmittingFeedback)
                    .listRowInsets(EdgeInsets(top: Spacing.sm, leading: Spacing.lg, bottom: Spacing.sm, trailing: Spacing.lg))
                    .glassRow()

                    if let msg = viewModel.feedbackMessage {
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(msg.contains("Thank") ? .green : .red)
                            .glassRow()
                    }
                } header: {
                    Text("Rate the Forecast").premiumSectionHeader()
                } footer: {
                    Text("Your feedback directly improves tomorrow's predictions.").premiumSectionFooter()
                }

                // Honest letter — accent bar treatment
                Section {
                    VStack(alignment: .leading, spacing: Spacing.md) {
                        letterParagraph("Seaside Beacon is young, built by one person, fuelled by early mornings and an honest obsession with getting the sky right. We launched with four Chennai beaches and a simple promise: no one should waste a 5 AM alarm on a grey horizon.")

                        letterParagraph("We know we won't nail every forecast. Some mornings the atmosphere does something no model predicted. Some mornings we'll say Skip and the sky will prove us wrong. That's the nature of reading weather \u{2014} it sometimes humbles you. But every single data point makes the next prediction sharper, and that's where you come in.")

                        letterParagraph("If you woke up to a sunrise worth remembering, send us the photo. If we told you to go and it was breathtaking, we want to see it through your eyes. If we told you to skip and you went anyway and it was incredible, we definitely want to know.")

                        letterParagraph("And if we got it wrong, tell us. Honestly. No sugarcoating needed. Did we oversell a 78? Did we undersell a quiet morning that turned out to be magic? That feedback is what separates a forecast that guesses from one that learns.")

                        letterParagraph("This isn't a company asking for engagement. It's a builder asking for partnership. Your mornings, your honesty, your voice \u{2014} they shape what Seaside Beacon becomes.")

                        Text("\u{2014} Kevin T, Builder of Seaside Beacon")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .italic()
                    }
                    .padding(.vertical, Spacing.xs)
                    .glassRow()
                } header: {
                    Text("An Honest Letter").premiumSectionHeader()
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.04, green: 0.03, blue: 0.06).ignoresSafeArea())
            .navigationTitle("Community")
            .navigationBarTitleDisplayMode(.large)
            .sensoryFeedback(.selection, trigger: viewModel.rating)
            .fullScreenCover(isPresented: $showingFullPhoto) {
                if let preview = viewModel.previewImage {
                    ZStack {
                        Color.black.ignoresSafeArea()
                        preview
                            .resizable()
                            .scaledToFit()
                    }
                    .overlay(alignment: .topTrailing) {
                        Button { showingFullPhoto = false } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title2)
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, .white.opacity(0.35))
                        }
                        .padding()
                    }
                }
            }
        }
    }

    // MARK: - Letter Paragraph (accent bar)

    private func letterParagraph(_ text: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(MaterialStyle.accent.opacity(0.4))
                .frame(width: 3)

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    CommunityView()
}
