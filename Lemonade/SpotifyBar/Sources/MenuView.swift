import AppKit
import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            playerRow
            Divider()
            searchRow
            if !model.listTitle.isEmpty, !model.results.isEmpty {
                Text(model.listTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            resultsList
            if !model.status.isEmpty {
                Text(model.status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(width: 340, alignment: .topLeading)
        .frame(maxHeight: 460, alignment: .top)
        .onAppear { model.playerMenuAppeared() }
        .onDisappear { model.playerMenuDisappeared() }
    }

    private var playerRow: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(nowPlayingTitle)
                    .font(.subheadline)
                    .lineLimit(1)
                Text(nowPlayingSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            Button {
                model.togglePlay()
            } label: {
                Image(systemName: model.player.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 32, height: 32)
                    .background(.quaternary, in: Circle())
            }
            .buttonStyle(.plain)
            .help(model.player.isPlaying ? "Pause" : "Play")
        }
    }

    private var nowPlayingTitle: String {
        if !model.player.title.isEmpty { return model.player.title }
        if model.player.isRunning { return "Spotify" }
        return "Ready"
    }

    private var nowPlayingSubtitle: String {
        if !model.player.artist.isEmpty { return model.player.artist }
        if model.player.isPlaying { return "Playing" }
        if model.player.isRunning { return "Paused" }
        return "Play starts Spotify in the background"
    }

    private var searchRow: some View {
        HStack(spacing: 8) {
            SearchField(text: $model.query, onSubmit: { model.search() })
                .frame(maxWidth: .infinity, minHeight: 24, maxHeight: 24)
            Button("Search") { model.search() }
                .controlSize(.small)
                .disabled(model.isSearching)
            if !model.results.isEmpty {
                Button {
                    model.loadMore()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .disabled(model.isSearching || !model.canLoadMore)
                .help("More results")
                .opacity(model.canLoadMore ? 1 : 0.35)
            }
        }
    }

    private var resultsList: some View {
        Group {
            if model.results.isEmpty {
                EmptyView()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(model.results) { track in
                            Button {
                                model.playTrack(track)
                            } label: {
                                HStack(spacing: 8) {
                                    cover(track.imageURL)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(track.name)
                                            .font(.subheadline)
                                            .lineLimit(1)
                                        Text(track.artist)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(width: 312, height: resultsHeight, alignment: .top)
            }
        }
    }

    private var resultsHeight: CGFloat {
        min(CGFloat(model.results.count) * 48, 280)
    }

    private func cover(_ url: URL?) -> some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: 36, height: 36)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(.quaternary)
            Image(systemName: "music.note")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
    }
}
