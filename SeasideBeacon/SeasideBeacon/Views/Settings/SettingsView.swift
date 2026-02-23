import SwiftUI

/// Settings tab — native Form with toggles and pickers.
/// Visual polish: accent-tinted icons, styled About section, liquid glass rows.
struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @FocusState private var isEmailFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                // Notifications
                Section {
                    Toggle(isOn: $viewModel.muteAll) {
                        Label("Mute All", systemImage: "bell.slash")
                    }
                    .glassRow()
                    Toggle(isOn: $viewModel.morningEnabled) {
                        Label("Morning Forecast (4 AM)", systemImage: "sunrise")
                    }
                    .disabled(viewModel.muteAll)
                    .glassRow()
                    Toggle(isOn: $viewModel.eveningEnabled) {
                        Label("Evening Preview (8:30 PM)", systemImage: "moon.stars")
                    }
                    .disabled(viewModel.muteAll)
                    .glassRow()
                } header: {
                    Text("Notifications").premiumSectionHeader()
                } footer: {
                    Text("Push notifications for daily sunrise forecasts.").premiumSectionFooter()
                }

                // Default beach
                Section {
                    Picker(selection: $viewModel.defaultBeach) {
                        ForEach(Beach.defaults) { beach in
                            Text(beach.name).tag(beach.key)
                        }
                    } label: {
                        Label("Default Beach", systemImage: "mappin.and.ellipse")
                    }
                    .glassRow()
                } footer: {
                    Text("This beach loads first when you open the app.").premiumSectionFooter()
                }

                // Email subscription
                Section {
                    HStack(spacing: Spacing.md) {
                        Image(systemName: "envelope")
                            .foregroundStyle(.secondary)
                            .frame(width: 22)
                        TextField("your@email.com", text: $viewModel.email)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .focused($isEmailFocused)
                            .submitLabel(.done)
                            .onSubmit { isEmailFocused = false }
                    }
                    .glassRow()

                    HStack {
                        Button {
                            isEmailFocused = false
                            Task { await viewModel.subscribe() }
                        } label: {
                            Text("Subscribe")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, Spacing.lg)
                                .padding(.vertical, Spacing.sm)
                                .background(viewModel.email.isEmpty ? Color.white.opacity(0.04) : MaterialStyle.accent)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(viewModel.isSubscribing || viewModel.email.isEmpty)

                        Spacer()

                        Button {
                            isEmailFocused = false
                            Task { await viewModel.unsubscribe() }
                        } label: {
                            Text("Unsubscribe")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .disabled(viewModel.isSubscribing || viewModel.email.isEmpty)
                    }
                    .glassRow()

                    if let msg = viewModel.emailMessage {
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(msg.contains("success") || msg.contains("Subscribed") ? .green : msg.contains("Unsubscribed") ? .secondary : .red)
                            .glassRow()
                    }
                } header: {
                    Text("Email Forecasts").premiumSectionHeader()
                } footer: {
                    Text("Receive daily sunrise forecasts by email.").premiumSectionFooter()
                }

                // About
                Section {
                    HStack(spacing: Spacing.md) {
                        BeaconLogo(size: 40)

                        VStack(alignment: .leading, spacing: Spacing.xxs) {
                            Text("Seaside Beacon")
                                .font(.headline)
                            Text("Version 1.0.0")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, Spacing.xs)
                    .glassRow()

                    LabeledContent {
                        Text("Kevin T")
                    } label: {
                        Label("Built by", systemImage: "person")
                    }
                    .glassRow()

                    Link(destination: URL(string: "https://seasidebeacon.com")!) {
                        Label("Visit Website", systemImage: "safari")
                    }
                    .glassRow()
                } header: {
                    Text("About").premiumSectionHeader()
                } footer: {
                    Text("India's first native sunrise quality prediction app.").premiumSectionFooter()
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.04, green: 0.03, blue: 0.06).ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .tint(MaterialStyle.accent)
        }
    }
}

#Preview {
    SettingsView()
}
