const STORAGE_KEY = "minigames-lang";

const I18N = {
  en: {
    title: "Minigames",
    kicker: "Browser arcade",
    lead: "A small collection of games you can play in the browser, plus two Mac apps.",
    play: "Play",
    read: "Read",
    appsTitle: "Mac apps",
    appsLead: "Native Mac tools. Open a card to read how they work.",
    spotifyTitle: "SpotifyBar",
    spotifyBlurb: "Menu bar extra next to Wi-Fi. Search a song and play it in Spotify.",
    pdfTitle: "PDF Eater",
    pdfBlurb: "Drop a file on the desk machine. It comes back as PDF, image, or text.",
    neonTitle: "Neon Clash",
    neonBlurb: "Rock, paper, scissors. Ten rounds against the computer.",
    poolTitle: "Mini 8-Ball",
    poolBlurb: "8-ball pool against a bot. Drag back from the cue ball to shoot.",
    keepTitle: "Castle defense",
    keepBlurb: "Hold the meadow. Fly the camera, place defenses, and survive the waves.",
    meridianTitle: "Meridian Front",
    meridianBlurb: "Late Cretaceous grand strategy. Command dinosaur packs on the European map.",
    nullTitle: "Site Null",
    nullBlurb: "Endless generated backrooms. Something waits around the corner. Blink, and do not look away.",
    langLabel: "Language",
  },
  de: {
    title: "Minispiele",
    kicker: "Browser-Arcade",
    lead: "Eine kleine Sammlung von Spielen direkt im Browser, plus zwei Mac-Apps.",
    play: "Spielen",
    read: "Lesen",
    appsTitle: "Mac-Apps",
    appsLead: "Native Mac-Tools. Öffne eine Karte, um zu lesen, wie sie funktionieren.",
    spotifyTitle: "SpotifyBar",
    spotifyBlurb: "Menüleiste neben dem WLAN. Song suchen und in Spotify abspielen.",
    pdfTitle: "PDF Eater",
    pdfBlurb: "Datei in die Maschine auf dem Schreibtisch. Zurück kommt PDF, Bild oder Text.",
    neonTitle: "Neon Clash",
    neonBlurb: "Schere, Stein, Papier. Zehn Runden gegen den Computer.",
    poolTitle: "Mini 8-Ball",
    poolBlurb: "8-Ball gegen einen Bot. Ziehe von der weißen Kugel weg, um zu stoßen.",
    keepTitle: "Castle defense",
    keepBlurb: "Halte die Wiese. Flieg mit der Kamera, bau Verteidigung und übersteh die Wellen.",
    meridianTitle: "Meridian Front",
    meridianBlurb: "Grand Strategy in der späten Kreide. Führe Dinosaurier-Rudel auf der Europakarte.",
    nullTitle: "Site Null",
    nullBlurb: "Endlose generierte Backrooms. Etwas wartet hinter der Ecke. Blinzle, und schau nicht weg.",
    langLabel: "Sprache",
  },
};

function currentLang() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("lang");
  if (fromUrl === "de" || fromUrl === "en") return fromUrl;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "de" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

function applyLang(lang) {
  const copy = I18N[lang] || I18N.en;
  document.documentElement.lang = lang;
  document.title = copy.title;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (copy[key]) el.textContent = copy[key];
  });
  document.querySelectorAll(".lang button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  });
  const group = document.querySelector(".lang");
  if (group) group.setAttribute("aria-label", copy.langLabel);
  localStorage.setItem(STORAGE_KEY, lang);
}

const lang = currentLang();
applyLang(lang);

document.querySelectorAll(".lang button").forEach((btn) => {
  btn.addEventListener("click", () => applyLang(btn.dataset.lang));
});
