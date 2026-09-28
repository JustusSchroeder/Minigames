const STORAGE_KEY = "minigames-lang";

const I18N = {
  en: {
    title: "Minigames",
    kicker: "Browser arcade",
    lead: "A small collection of games you can play in the browser. Pick a card to start.",
    play: "Play",
    neonTitle: "Neon Clash",
    neonBlurb: "Rock, paper, scissors. Ten rounds against the computer.",
    poolTitle: "Mini 8-Ball",
    poolBlurb: "8-ball pool against a bot. Drag back from the cue ball to shoot.",
    keepTitle: "Castle defense",
    keepBlurb: "Hold the meadow. Fly the camera, place defenses, and survive the waves.",
    langLabel: "Language",
  },
  de: {
    title: "Minispiele",
    kicker: "Browser-Arcade",
    lead: "Eine kleine Sammlung von Spielen direkt im Browser. Wähle eine Karte und spiel los.",
    play: "Spielen",
    neonTitle: "Neon Clash",
    neonBlurb: "Schere, Stein, Papier. Zehn Runden gegen den Computer.",
    poolTitle: "Mini 8-Ball",
    poolBlurb: "8-Ball gegen einen Bot. Ziehe von der weißen Kugel weg, um zu stoßen.",
    keepTitle: "Castle defense",
    keepBlurb: "Halte die Wiese. Flieg mit der Kamera, bau Verteidigung und übersteh die Wellen.",
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
