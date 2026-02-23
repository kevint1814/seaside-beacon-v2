import SwiftUI

/// Explore tab — educational content about sunrise science.
/// Full content from the website. Visual polish with icons, mini arcs, accent bars.
struct ExploreView: View {
    @State private var selectedImage: ViewableImage?

    var body: some View {
        NavigationStack {
            List {
                // The Craft
                Section {
                    ForEach(Self.craftArticles) { article in
                        HStack(alignment: .top, spacing: Spacing.md) {
                            Image(systemName: article.icon)
                                .font(.body)
                                .foregroundStyle(MaterialStyle.accent)
                                .frame(width: 24, height: 24)
                                .padding(.top, 2)

                            VStack(alignment: .leading, spacing: Spacing.sm) {
                                Text(article.title)
                                    .font(.headline)
                                Text(article.body)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(.vertical, Spacing.xs)
                        .glassRow()
                    }
                } header: {
                    Text("The Craft").premiumSectionHeader()
                } footer: {
                    Text("How we read the dawn sky.").premiumSectionFooter()
                }

                // Case Studies
                Section {
                    ForEach(Self.caseStudies) { study in
                        caseStudyRow(study)
                            .glassRow()
                    }
                } header: {
                    Text("Real Mornings").premiumSectionHeader()
                } footer: {
                    Text("All photos clicked at Chennai beaches.").premiumSectionFooter()
                }

                // The Story
                Section {
                    VStack(alignment: .leading, spacing: Spacing.md) {
                        // Founder avatar
                        HStack(spacing: Spacing.md) {
                            AsyncImage(url: URL(string: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_120,h_120,c_fill,g_face,f_auto,q_auto/kevin-at-beach_f03o9z.jpg")) { image in
                                image
                                    .resizable()
                                    .scaledToFill()
                            } placeholder: {
                                Circle()
                                    .fill(Color.white.opacity(0.04))
                            }
                            .frame(width: 48, height: 48)
                            .clipShape(Circle())

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Kevin T")
                                    .font(.subheadline.weight(.semibold))
                                Text("Builder of Seaside Beacon")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Text("June 13, 2023")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(MaterialStyle.accent)
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.xs)
                            .background(
                                Capsule()
                                    .fill(MaterialStyle.accent.opacity(0.1))
                            )

                        Text("I moved to Chennai from Rajapalayam, a small town in South Tamil Nadu near Courtallam, just after the post-pandemic relaxations. New city, new pace, new life. The night before my birthday, June 13, 2023, I went out on my bike with nothing but time and curiosity. No destination. No plan. Somewhere along the ride, the roads led me to Marina Beach. It was around 5 AM.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("The city felt different at that hour. Not loud. Not rushed. Just, alive in a quieter way.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("I walked toward the waves and saw fishermen beginning their day \u{2014} pulling boats in, setting nets, preparing with focus and pride. I had never witnessed that world so closely. I remember standing there thinking: so much effort happens before sunrise, and most people never even see it. And then the sky arrived.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        // First sunrise photo (Instagram post — uncropped)
                        AsyncImage(url: URL(string: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_600,f_auto,q_auto/ig-first-sunrise_vlmwme.jpg")) { image in
                            image
                                .resizable()
                                .scaledToFit()
                        } placeholder: {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.white.opacity(0.04))
                                .frame(height: 180)
                        }
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .expandableOverlay()
                        .contentShape(Rectangle())
                        .onTapGesture { selectedImage = ViewableImage("https://res.cloudinary.com/dj0ewfbtf/image/upload/w_600,f_auto,q_auto/ig-first-sunrise_vlmwme.jpg") }

                        Text("Pinkish blues first. Then gold. The entire horizon turned dramatic, like it was putting on a show just because it could.")
                            .font(.subheadline.italic())
                            .foregroundStyle(MaterialStyle.accent)

                        Text("It was my first ever sunrise, and it felt like the perfect beginning to a birthday: grounding, beautiful, and strangely emotional.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("The next weekend, I returned chasing the same moment, but the sunrise wasn't there. The sky was dull. Another day, only clouds. Some mornings came through, some didn't, and that unpredictability kept pulling me back.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("So I did what I naturally do. I started learning the \"why.\" I researched weather patterns, tracked the signals, and slowly developed a mental system \u{2014} a metric-range mindset \u{2014} where a few numbers could tell me whether the sunrise would be worth it.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("Eventually my friends started asking me, \"How do you always get it right that it'll be good tomorrow?\" That question became the spark. If I could figure this out manually, why not build something that does it automatically \u{2014} for me, for my friends, and for anyone who just wants to witness the ocean and sky at their best?")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        // Building beacon photo (Instagram post — uncropped)
                        AsyncImage(url: URL(string: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_600,f_auto,q_auto/ig-building-beacon_rbzgpg.jpg")) { image in
                            image
                                .resizable()
                                .scaledToFit()
                        } placeholder: {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.white.opacity(0.04))
                                .frame(height: 180)
                        }
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .expandableOverlay()
                        .contentShape(Rectangle())
                        .onTapGesture { selectedImage = ViewableImage("https://res.cloudinary.com/dj0ewfbtf/image/upload/w_600,f_auto,q_auto/ig-building-beacon_rbzgpg.jpg") }

                        Text("That's how Seaside Beacon started. India's first purpose-built sunrise forecast for beaches \u{2014} from one sunrise, one disappointment, and the simple belief that nature's best moments shouldn't be left to guesswork.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text("\u{2014} Kevin T, Builder")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .italic()
                    }
                    .padding(.vertical, Spacing.xs)
                    .glassRow()
                } header: {
                    Text("The Story").premiumSectionHeader()
                }

                // How It Works
                Section {
                    HStack(alignment: .top, spacing: Spacing.md) {
                        Image(systemName: "waveform.path.ecg")
                            .font(.body)
                            .foregroundStyle(MaterialStyle.accent)
                            .frame(width: 24)

                        VStack(alignment: .leading, spacing: Spacing.sm) {
                            Text("Seaside Beacon reads 9 atmospheric factors \u{2014} cloud cover, cloud layers, humidity, pressure trend, aerosol optical depth, visibility, weather conditions, wind, and solar position \u{2014} to predict what the sky will look like at sunrise.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            Text("We don't run ads. We don't sell data. We just want more people to see beautiful sunrises.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, Spacing.xs)
                    .glassRow()
                } header: {
                    Text("How It Works").premiumSectionHeader()
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.04, green: 0.03, blue: 0.06).ignoresSafeArea())
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.large)
            .fullScreenCover(item: $selectedImage) { item in
                ImageViewer(url: item.fullSizeURL)
            }
        }
    }

    // MARK: - Case Study Row

    private func caseStudyRow(_ study: CaseStudy) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            // Photo
            AsyncImage(url: URL(string: study.imageURL)) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.04))
                    .frame(height: 180)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .expandableOverlay()
            .contentShape(Rectangle())
            .onTapGesture { selectedImage = ViewableImage(study.imageURL) }

            HStack {
                Text(study.beach)
                    .font(.headline)
                Spacer()
                miniScoreArc(score: study.score)
                Text(study.verdict)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(MaterialStyle.verdictColor(for: study.verdict))
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xxs)
                    .background(
                        Capsule()
                            .fill(MaterialStyle.verdictColor(for: study.verdict).opacity(0.1))
                    )
            }

            Text(study.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // Conditions pill
            Text(study.conditions)
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.xs)
                .background(Color.white.opacity(0.04), in: Capsule())
        }
        .padding(.vertical, Spacing.xs)
    }

    // MARK: - Mini Score Arc

    private func miniScoreArc(score: Int) -> some View {
        let color = MaterialStyle.scoreColor(for: score)
        let progress = Double(score) / 100.0

        return ZStack {
            Circle()
                .trim(from: 0, to: 0.75)
                .stroke(Color.primary.opacity(0.06), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(135))

            Circle()
                .trim(from: 0, to: progress * 0.75)
                .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(135))

            Text("\(score)")
                .font(.caption2.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
        }
        .frame(width: 36, height: 36)
    }

    // MARK: - Data

    private struct Article: Identifiable {
        let id = UUID()
        let title: String
        let body: String
        let icon: String
    }

    private struct CaseStudy: Identifiable {
        let id = UUID()
        let beach: String
        let score: Int
        let verdict: String
        let description: String
        let conditions: String
        let imageURL: String
    }

    private static let craftArticles: [Article] = [
        Article(
            title: "Clouds are not the enemy",
            body: "A clear sky at dawn is often flat and pale. No drama, no colour. The fires happen when broken clouds \u{2014} 30 to 60 percent coverage \u{2014} hang low enough to catch the first light from below the horizon. We read cloud layers separately: high clouds paint the canvas, low clouds block the light. The score rewards the sweet spot.",
            icon: "cloud.sun"
        ),
        Article(
            title: "Moisture shapes colour",
            body: "Low humidity means crisp, saturated reds and golds. High humidity scatters and mutes. The same sky looks washed out through humid air. We factor atmospheric moisture alongside cloud cover, because both determine what your sensor actually captures.",
            icon: "humidity"
        ),
        Article(
            title: "Every beach is different",
            body: "Marina's 13 kilometre flat expanse reads differently to Covelong's rock formations. The same cloud pattern calls for different compositions, different timing, different focal lengths. Our photography guidance is specific to your beach, not generic sunrise advice.",
            icon: "map"
        ),
        Article(
            title: "The ten minutes before sunrise",
            body: "Most photographers arrive at sunrise. The professionals arrive earlier. The sky's most dramatic colours appear in the window before the sun clears the horizon, the civil twilight. We mark this window precisely for tomorrow's exact sunrise time at your beach.",
            icon: "clock"
        ),
    ]

    private static let caseStudies: [CaseStudy] = [
        CaseStudy(
            beach: "Covelong Beach",
            score: 87,
            verdict: "GO",
            description: "40% broken cloud at the perfect altitude. Low humidity kept every colour saturated. This is what the sweet spot looks like.",
            conditions: "Cloud 40% | Humidity 38% | Vis 14km",
            imageURL: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_500,h_400,c_fill,g_center,f_auto,q_auto/covelong-pink-sky_cqm9fk.jpg"
        ),
        CaseStudy(
            beach: "Covelong Beach",
            score: 22,
            verdict: "SKIP",
            description: "92% cloud with no breaks. High humidity washed everything out. Beautiful long exposure \u{2014} but not what you set a 5 AM alarm for.",
            conditions: "Cloud 92% | Humidity 84% | Vis 6km",
            imageURL: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_500,h_400,c_fill,g_south,f_auto,q_auto/covelong-overcast_mupb15.jpg"
        ),
        CaseStudy(
            beach: "Marina Beach",
            score: 48,
            verdict: "MAYBE",
            description: "Clear sky sounds perfect, right? But no clouds means no canvas. Add Chennai's coastal haze and you get warmth without drama.",
            conditions: "Cloud 10% | Humidity 72% | Vis 8km",
            imageURL: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_500,h_400,c_fill,g_south_east,f_auto,q_auto/marina-hazy_e0weqg.jpg"
        ),
        CaseStudy(
            beach: "Marina Beach",
            score: 78,
            verdict: "GO",
            description: "Clean break at the horizon with 15% cloud. Low humidity gave razor-sharp contrast between deep blue and molten gold.",
            conditions: "Cloud 15% | Humidity 42% | Vis 16km",
            imageURL: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_500,h_400,c_fill,g_center,f_auto,q_auto/marina-golden-hour_u3pfak.jpg"
        ),
        CaseStudy(
            beach: "Covelong Beach",
            score: 72,
            verdict: "GO",
            description: "Scattered mid-level cloud catching light from below the horizon. The fishing boat wasn't planned \u{2014} but the atmosphere was predicted.",
            conditions: "Cloud 45% | Humidity 50% | Vis 12km",
            imageURL: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_500,h_400,c_fill,g_south,f_auto,q_auto/covelong-boat-sunrise_xhhtl9.jpg"
        ),
        CaseStudy(
            beach: "Marina Beach",
            score: 82,
            verdict: "GO",
            description: "45% dramatic cumulus with crepuscular rays \u{2014} right in the sweet spot. Those rays exist because the clouds broke the light. High clouds paint colour, low clouds shape drama.",
            conditions: "Cloud 45% | Humidity 48% | Vis 12km",
            imageURL: "https://res.cloudinary.com/dj0ewfbtf/image/upload/w_600,h_500,c_fill,g_center,f_auto,q_auto/marina-cumulus-rays_uz7eep.jpg"
        ),
    ]
}

#Preview {
    ExploreView()
}
