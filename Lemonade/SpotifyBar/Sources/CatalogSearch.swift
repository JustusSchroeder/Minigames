import Foundation

enum CatalogSearch {
    static let pageSize = 15

    static func songs(matching query: String, offset: Int = 0) async throws -> SongPage {
        let raw = try await catalog(matching: query, offset: offset)
        return SongPage(
            tracks: rank(unique(raw), for: query),
            nextOffset: offset + raw.count,
            mightHaveMore: raw.count == pageSize
        )
    }

    static func featured() async -> [Track] {
        guard let url = URL(string: "https://api.deezer.com/chart/0/tracks?limit=\(pageSize)") else {
            return []
        }
        let json = (try? await get(url)) ?? [:]
        return unique(parseDeezer(json["data"]))
    }

    private static func catalog(matching query: String, offset: Int) async throws -> [Track] {
        let deezerTracks = (try? await deezer(term: query, index: offset)) ?? []
        if !deezerTracks.isEmpty { return deezerTracks }
        return (try? await itunes(term: query, offset: offset)) ?? []
    }

    private static var uriCache: [String: String] = [:]

    static func spotifyURI(for track: Track) async -> String? {
        if let uri = track.spotifyURI, uri.hasPrefix("spotify:track:") { return uri }
        if let cached = uriCache[track.id] { return cached }
        let uri = await firstCompleted(
            timeout: 16,
            work: { await resolve(track) }
        )
        if let uri {
            uriCache[track.id] = uri
        }
        return uri
    }

    private static func resolve(_ track: Track) async -> String? {
        if Task.isCancelled { return nil }
        if let isrc = await isrc(for: track),
           let uri = try? await musicBrainzURI(isrc: isrc) {
            return uri
        }
        if Task.isCancelled { return nil }
        let shortTitle = simplifiedTitle(track.name)
        if let uri = await webSearchURI(title: track.name, artist: track.artist) {
            return uri
        }
        if shortTitle != track.name,
           let uri = await webSearchURI(title: shortTitle, artist: track.artist) {
            return uri
        }
        if Task.isCancelled { return nil }
        return try? await musicBrainzURI(title: track.name, artist: track.artist)
    }

    private static func webSearchURI(title: String, artist: String) async -> String? {
        let query = "site:open.spotify.com/track \"\(title)\" \"\(artist)\""
        if let html = try? await htmlPOST(
            URL(string: "https://html.duckduckgo.com/html/")!,
            form: ["q": query]
        ), let uri = bestTrackURI(in: html, title: title, artist: artist) {
            return uri
        }
        var brave = URLComponents(string: "https://search.brave.com/search")!
        brave.queryItems = [URLQueryItem(name: "q", value: query)]
        if let url = brave.url,
           let html = try? await htmlGET(url),
           let uri = bestTrackURI(in: html, title: title, artist: artist) {
            return uri
        }
        return nil
    }

    private static func bestTrackURI(in html: String, title: String, artist: String) -> String? {
        let ids = uniqueTrackIDs(in: html)
        guard !ids.isEmpty else { return nil }
        let titleN = normalize(title)
        let artistN = normalize(artist)
        let hay = normalize(html)
        for id in ids {
            guard let range = hay.range(of: id.lowercased()) else { continue }
            let start = hay.index(range.lowerBound, offsetBy: -160, limitedBy: hay.startIndex) ?? hay.startIndex
            let end = hay.index(range.upperBound, offsetBy: 160, limitedBy: hay.endIndex) ?? hay.endIndex
            let around = hay[start..<end]
            if around.contains(titleN), around.contains(artistN) {
                return "spotify:track:\(id)"
            }
        }
        return nil
    }

    private static func uniqueTrackIDs(in html: String) -> [String] {
        guard let regex = try? NSRegularExpression(
            pattern: #"open\.spotify\.com/track/([A-Za-z0-9]{22})"#
        ) else { return [] }
        let range = NSRange(html.startIndex..., in: html)
        var seen = Set<String>()
        var ids: [String] = []
        for match in regex.matches(in: html, range: range) {
            guard let idRange = Range(match.range(at: 1), in: html) else { continue }
            let id = String(html[idRange])
            if seen.insert(id).inserted {
                ids.append(id)
            }
        }
        return ids
    }

    private static func normalize(_ text: String) -> String {
        text.lowercased()
            .folding(options: .diacriticInsensitive, locale: .current)
    }

    private static func isrc(for track: Track) async -> String? {
        if let isrc = track.isrc, !isrc.isEmpty { return isrc }
        if track.id.hasPrefix("deezer-") {
            let id = String(track.id.dropFirst("deezer-".count))
            if let isrc = try? await deezerISRC(id: id) { return isrc }
        }
        return try? await deezerISRC(title: track.name, artist: track.artist)
    }

    private static func deezer(term: String, index: Int) async throws -> [Track] {
        var components = URLComponents(string: "https://api.deezer.com/search")!
        components.queryItems = [
            URLQueryItem(name: "q", value: term),
            URLQueryItem(name: "limit", value: String(pageSize)),
            URLQueryItem(name: "index", value: String(index))
        ]
        let json = try await get(components.url!)
        return parseDeezer(json["data"])
    }

    private static func parseDeezer(_ value: Any?) -> [Track] {
        dictionaries(in: value).compactMap { item in
            guard let title = item["title"] as? String,
                  let artist = (item["artist"] as? [String: Any])?["name"] as? String else { return nil }
            let id = stringID(item["id"]) ?? title
            let link = (item["link"] as? String).flatMap(URL.init(string:))
                ?? URL(string: "https://www.deezer.com/track/\(id)")
            guard let link else { return nil }
            let cover = ((item["album"] as? [String: Any])?["cover_medium"] as? String)
                ?? ((item["album"] as? [String: Any])?["cover_small"] as? String)
            let isrc = item["isrc"] as? String
            return Track(
                id: "deezer-\(id)",
                name: title,
                artist: artist,
                sourceURL: link,
                imageURL: cover.flatMap(URL.init(string:)),
                isrc: isrc?.isEmpty == false ? isrc : nil,
                spotifyURI: nil
            )
        }
    }

    private static func itunes(term: String, offset: Int) async throws -> [Track] {
        var components = URLComponents(string: "https://itunes.apple.com/search")!
        components.queryItems = [
            URLQueryItem(name: "term", value: term),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: String(pageSize)),
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "country", value: countryCode)
        ]
        let json = try await get(components.url!)
        return dictionaries(in: json["results"]).compactMap { item in
            guard let name = item["trackName"] as? String,
                  let artist = item["artistName"] as? String,
                  let urlString = item["trackViewUrl"] as? String,
                  let url = URL(string: urlString) else { return nil }
            let id = stringID(item["trackId"]) ?? urlString
            let art = (item["artworkUrl100"] as? String ?? item["artworkUrl60"] as? String)?
                .replacingOccurrences(of: "http://", with: "https://")
            return Track(
                id: "itunes-\(id)",
                name: name,
                artist: artist,
                sourceURL: url,
                imageURL: art.flatMap(URL.init(string:)),
                isrc: nil,
                spotifyURI: nil
            )
        }
    }

    private static func musicBrainzURI(isrc: String) async throws -> String? {
        let code = isrc.replacingOccurrences(of: "-", with: "").uppercased()
        guard let url = URL(string: "https://musicbrainz.org/ws/2/isrc/\(code)?fmt=json") else { return nil }
        let json = try await mbGet(url)
        return try await firstSpotifyURI(in: dictionaries(in: json["recordings"]))
    }

    private static func musicBrainzURI(title: String, artist: String) async throws -> String? {
        let query = "recording:\"\(escapeLucene(title))\" AND artist:\"\(escapeLucene(artist))\""
        var search = URLComponents(string: "https://musicbrainz.org/ws/2/recording/")!
        search.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "fmt", value: "json"),
            URLQueryItem(name: "limit", value: "5")
        ]
        let json = try await mbGet(search.url!)
        return try await firstSpotifyURI(in: dictionaries(in: json["recordings"]))
    }

    private static func deezerISRC(id: String) async throws -> String? {
        guard let url = URL(string: "https://api.deezer.com/track/\(id)") else { return nil }
        let json = try await get(url)
        let isrc = json["isrc"] as? String
        return isrc?.isEmpty == false ? isrc : nil
    }

    private static func deezerISRC(title: String, artist: String) async throws -> String? {
        var components = URLComponents(string: "https://api.deezer.com/search")!
        components.queryItems = [
            URLQueryItem(name: "q", value: "track:\"\(title)\" artist:\"\(artist)\""),
            URLQueryItem(name: "limit", value: "1")
        ]
        let json = try await get(components.url!)
        guard let item = dictionaries(in: json["data"]).first,
              let id = stringID(item["id"]) else { return nil }
        if let isrc = item["isrc"] as? String, !isrc.isEmpty { return isrc }
        return try await deezerISRC(id: id)
    }

    private static func firstSpotifyURI(in recordings: [[String: Any]]) async throws -> String? {
        let ids = recordings.prefix(5).compactMap { $0["id"] as? String }
        guard !ids.isEmpty else { return nil }
        let joined = ids.joined(separator: ";")
        guard let url = URL(string: "https://musicbrainz.org/ws/2/recording/\(joined)?inc=url-rels&fmt=json") else {
            return nil
        }
        let json = try await mbGet(url)
        let records: [[String: Any]]
        if json["relations"] != nil, json["id"] != nil {
            records = [json]
        } else {
            records = dictionaries(in: json["recordings"])
        }
        for record in records {
            if let uri = spotifyURI(in: record) {
                return uri
            }
        }
        return nil
    }

    private static func spotifyURI(in recording: [String: Any]) -> String? {
        let relations = recording["relations"] as? [Any] ?? []
        for relation in relations {
            guard let dict = relation as? [String: Any],
                  let url = (dict["url"] as? [String: Any])?["resource"] as? String,
                  url.contains("spotify.com/track/"),
                  let uri = trackURI(from: url) else { continue }
            return uri
        }
        return nil
    }

    private static func simplifiedTitle(_ title: String) -> String {
        var text = title
        for pattern in [#"\s*\(feat\..*?\)"#, #"\s*\(ft\..*?\)"#, #"\s*\(with .*?\)"#, #"\s*\[.*?\]"#] {
            text = text.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func escapeLucene(_ text: String) -> String {
        text.replacingOccurrences(of: "\"", with: "")
    }

    private static func rank(_ tracks: [Track], for query: String) -> [Track] {
        let tokens = query.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
        return tracks.sorted { lhs, rhs in
            score(lhs, tokens: tokens) > score(rhs, tokens: tokens)
        }
    }

    private static func score(_ track: Track, tokens: [String]) -> Int {
        let hay = "\(track.artist) \(track.name)".lowercased()
        var value = 0
        for token in tokens where hay.contains(token) {
            value += 2
        }
        if !tokens.isEmpty, tokens.allSatisfy({ hay.contains($0) }) { value += 8 }
        return value
    }

    private static func unique(_ tracks: [Track]) -> [Track] {
        var seen = Set<String>()
        return tracks.filter { seen.insert($0.id).inserted }
    }

    private static func dictionaries(in value: Any?) -> [[String: Any]] {
        (value as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    }

    private static func stringID(_ value: Any?) -> String? {
        if let number = value as? NSNumber { return number.stringValue }
        if let string = value as? String, !string.isEmpty { return string }
        return nil
    }

    private static var countryCode: String {
        let raw = Locale.current.region?.identifier ?? "US"
        let code = String(raw.prefix(2)).uppercased()
        return code.count == 2 ? code : "US"
    }

    private static func trackURI(from page: String) -> String? {
        guard let range = page.range(of: "track/") else { return nil }
        let rest = page[range.upperBound...]
        let id = rest.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).first.map(String.init)
        guard let id, !id.isEmpty else { return nil }
        return "spotify:track:\(id)"
    }

    private static let mbLimiter = MusicBrainzLimiter()

    private static func mbGet(_ url: URL) async throws -> [String: Any] {
        try await mbLimiter.wait()
        var request = URLRequest(url: url)
        try Task.checkCancellation()
        request.timeoutInterval = 6
        request.setValue("SpotifyBar/1.0 ( https://musicbrainz.org )", forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SearchError.noSpotifyLink
        }
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private static let browserUA =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"

    private static func htmlGET(_ url: URL) async throws -> String {
        var request = URLRequest(url: url)
        try Task.checkCancellation()
        request.timeoutInterval = 8
        request.setValue(browserUA, forHTTPHeaderField: "User-Agent")
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SearchError.network
        }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func htmlPOST(_ url: URL, form: [String: String]) async throws -> String {
        var request = URLRequest(url: url)
        try Task.checkCancellation()
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        request.setValue(browserUA, forHTTPHeaderField: "User-Agent")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        request.httpBody = form
            .map { key, value in
                let encoded = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
                return "\(key)=\(encoded)"
            }
            .joined(separator: "&")
            .data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SearchError.network
        }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private static func get(_ url: URL) async throws -> [String: Any] {
        var request = URLRequest(url: url)
        try Task.checkCancellation()
        request.timeoutInterval = 5
        request.setValue(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
            forHTTPHeaderField: "User-Agent"
        )
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SearchError.network
        }
        return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    private static func firstCompleted(
        timeout seconds: Double,
        work: @escaping @Sendable () async -> String?
    ) async -> String? {
        await withTaskGroup(of: (Int, String?).self) { group in
            group.addTask { (0, await work()) }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return (1, nil)
            }
            let (which, value) = await group.next() ?? (1, nil)
            group.cancelAll()
            return which == 0 ? value : nil
        }
    }
}

private actor MusicBrainzLimiter {
    private var last = Date.distantPast

    func wait() async throws {
        let pause = 1.05 - Date().timeIntervalSince(last)
        if pause > 0 {
            try await Task.sleep(nanoseconds: UInt64(pause * 1_000_000_000))
        }
        last = Date()
    }
}

enum SearchError: LocalizedError {
    case network
    case noSpotifyLink

    var errorDescription: String? {
        switch self {
        case .network:
            return "Search failed. Check your connection."
        case .noSpotifyLink:
            return "Couldn’t play that on Spotify."
        }
    }
}
