import type { CampaignSnapshot } from "@meridian/core";
import { MAP_MODES, SIMULATION_SPEEDS, type Command, type MapMode } from "@meridian/shared";
import { useUi } from "../state/uiStore.ts";

const MODE_LABELS: Record<MapMode, string> = {
  political: "Political",
  terrain: "Terrain",
  infrastructure: "Infra",
  resources: "Resources",
  supply: "Supply",
  control: "Control",
  victory: "Victory",
};

export function TopBar({
  snapshot,
  fullscreen,
  onCommand,
  onSave,
  onToggleFullscreen,
}: {
  snapshot: CampaignSnapshot;
  fullscreen: boolean;
  onCommand: (command: Command) => void;
  onSave: () => void;
  onToggleFullscreen: () => void;
}) {
  const mode = useUi((state) => state.mapMode);
  const setMode = useUi((state) => state.setMapMode);
  const setPhase = useUi((state) => state.setPhase);
  const industryOpen = useUi((state) => state.industryOpen);
  const setIndustryOpen = useUi((state) => state.setIndustryOpen);
  const designerOpen = useUi((state) => state.designerOpen);
  const setDesignerOpen = useUi((state) => state.setDesignerOpen);
  const researchOpen = useUi((state) => state.researchOpen);
  const setResearchOpen = useUi((state) => state.setResearchOpen);
  const player = snapshot.countries.find((country) => country.id === snapshot.playerCountryId);
  return (
    <header className="hud-top">
      <div className="hud-country">
        {player ? <img src={player.flagRef} alt="" /> : null}
        <div>
          <strong>{player?.name ?? "Observer"}</strong>
          <span>
            Stability {player?.stability ?? 0} · War support {player?.warSupport ?? 0}
          </span>
          <span>Manpower {(player?.manpower ?? 0).toLocaleString()}</span>
          <span>{snapshot.weatherLabel} weather</span>
        </div>
      </div>
      <div className="hud-clock">
        <strong className="date" data-testid="game-date">
          {snapshot.dateLabel}
        </strong>
        <div className="speed-row">
          <button
            data-testid="pause"
            aria-pressed={snapshot.paused}
            onClick={() => onCommand(snapshot.paused ? { type: "resume" } : { type: "pause" })}
          >
            {snapshot.paused ? "Play" : "Pause"}
          </button>
          {SIMULATION_SPEEDS.map((speed) => (
            <button
              key={speed}
              data-testid={`speed-${speed}`}
              className={!snapshot.paused && snapshot.speed === speed ? "active" : ""}
              onClick={() => onCommand({ type: "setSpeed", speed })}
            >
              {speed}x
            </button>
          ))}
          <span data-testid="speed-label">{snapshot.paused ? "Paused" : `${snapshot.speed}x`}</span>
        </div>
      </div>
      <div className="hud-tools">
        <label className="map-mode-label">
          Map
          <select data-testid="map-mode" value={mode} onChange={(event) => setMode(event.target.value as MapMode)}>
            {MAP_MODES.map((item) => (
              <option key={item} value={item}>
                {MODE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        <button
          data-testid="toggle-industry"
          aria-pressed={industryOpen}
          onClick={() => setIndustryOpen(!industryOpen)}
        >
          Industry
        </button>
        <button
          data-testid="toggle-designer"
          aria-pressed={designerOpen}
          onClick={() => setDesignerOpen(!designerOpen)}
        >
          Recruit
        </button>
        <button
          data-testid="toggle-research"
          aria-pressed={researchOpen}
          onClick={() => setResearchOpen(!researchOpen)}
        >
          Research
        </button>
        <button data-testid="save-campaign" onClick={onSave}>
          Save
        </button>
        <button data-testid="toggle-fullscreen" aria-pressed={fullscreen} onClick={onToggleFullscreen}>
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
        <button onClick={() => setPhase("title")}>Menu</button>
      </div>
    </header>
  );
}
