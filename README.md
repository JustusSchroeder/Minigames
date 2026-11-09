# Minigames

A small GitHub Pages arcade with more than one browser game, plus two Mac apps (SpotifyBar and PDF Eater).

**Live:** [https://justusschroeder.github.io/Minigames/](https://justusschroeder.github.io/Minigames/)

## Games

| Game | Folder | Play |
| --- | --- | --- |
| Neon Clash (rock paper scissors) | `neon-clash/` | [Open](https://justusschroeder.github.io/Minigames/neon-clash/) |
| Castle defense | `castle-defense/` | [Open](https://justusschroeder.github.io/Minigames/castle-defense/) |
| Meridian Front | `meridian-front/` | [Open](https://justusschroeder.github.io/Minigames/meridian-front/) |
| Mini 8-Ball | `mini-8-ball/` | [Open](https://justusschroeder.github.io/Minigames/mini-8-ball/) |
| Site Null | `site-null/` | [Open](https://justusschroeder.github.io/Minigames/site-null/) |

The home page lists each game as a card, with a preview image and an English / German language toggle. Mac apps have their own cards that open a README-style overview (how the project works, not a playable page).

## Mac apps

| App | Overview | Notes |
| --- | --- | --- |
| SpotifyBar | [Open](https://justusschroeder.github.io/Minigames/spotifybar/) | Menu bar extra for search/play in the Spotify Mac app. Source: [MusicBar](https://github.com/JustusSchroeder/MusicBar) |
| PDF Eater | [Open](https://justusschroeder.github.io/Minigames/pdfeater/) | Desktop-folder converter: drop a file, get PDF/PNG/JPEG/text |

## Run locally

```bash
python3 -m http.server 8765
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Layout

```
index.html          Hub with game and Mac-app cards
css/hub.css
css/project.css     Shared styles for overview pages
js/hub.js
assets/previews/    Card screenshots
assets/overview/    Photos on the overview pages
overview.html       Castle defense write-up
spotifybar/         SpotifyBar overview
pdfeater/           PDF Eater overview
neon-clash/         Rock paper scissors
castle-defense/     Castle defense (see castle-defense/README.md)
meridian-front/     Late Cretaceous grand strategy (source in Strategie1/)
mini-8-ball/        8-ball vs a bot
site-null/          Generated backrooms wander
```
