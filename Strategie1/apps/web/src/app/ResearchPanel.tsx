import type { Command } from "@meridian/shared";
import { useUi } from "../state/uiStore.ts";

function percent(value: number): string {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
}

export function ResearchPanel({ onCommand }: { onCommand: (command: Command) => void }) {
  const snapshot = useUi((state) => state.snapshot);
  if (!snapshot) return null;
  const research = snapshot.research;
  const mods = research.modifiers;
  return (
    <aside className="panel industry-dock" data-testid="research-panel">
      <h2>Research</h2>
      <p className="muted">
        Each slot works one project at midnight. A finished technology or doctrine changes combat or the factories.
        A national focus is a separate track.
      </p>
      <p data-testid="research-slots">
        {research.used} of {research.slots} slots in use.
      </p>
      <div className="stat-grid" data-testid="research-modifiers">
        <span>Soft attack</span>
        <span>{percent(mods.softAttack)}</span>
        <span>Defence</span>
        <span>{percent(mods.defense)}</span>
        <span>Breakthrough</span>
        <span>{percent(mods.breakthrough)}</span>
        <span>Factory output</span>
        <span>{percent(mods.militaryOutput)}</span>
        <span>Construction</span>
        <span>{percent(mods.construction)}</span>
      </div>
      <h3>Known</h3>
      {research.researched.length === 0 ? <p className="muted">Nothing is researched yet.</p> : null}
      {research.researched.map((item) => (
        <p key={item.id} data-testid={`known-${item.id}`}>
          {item.name}. {item.summary}
        </p>
      ))}
      <h3>In the labs</h3>
      {research.projects.length === 0 ? <p className="muted">No project is assigned.</p> : null}
      {research.projects.map((item) => (
        <div key={item.id} className="queue-row" data-testid={`project-${item.id}`}>
          <span>
            {item.name} · {item.progress} / {item.days} days
          </span>
          <button onClick={() => onCommand({ type: "cancelResearch", techId: item.id })}>Cancel</button>
        </div>
      ))}
      <h3>Available</h3>
      {research.available.map((item) => (
        <div key={item.id} className="queue-row">
          <span>
            {item.name} · {item.days} days. {item.summary}
            {item.reason ? ` ${item.reason}` : ""}
          </span>
          <button
            data-testid={`start-research-${item.id}`}
            disabled={item.reason !== null || research.used >= research.slots}
            onClick={() => onCommand({ type: "startResearch", techId: item.id })}
          >
            Research
          </button>
        </div>
      ))}
      <h3>National focus</h3>
      {research.focus ? (
        <div className="queue-row" data-testid="active-focus">
          <span>
            {research.focus.name} · {research.focus.progress} / {research.focus.days} days
          </span>
          <button onClick={() => onCommand({ type: "cancelFocus" })}>Cancel</button>
        </div>
      ) : (
        <p className="muted">No focus is running.</p>
      )}
      {research.focuses.length === 0 ? <p className="muted">This country has no focus tree in this scenario.</p> : null}
      {research.focuses.map((item) => (
        <div key={item.id} className="queue-row">
          <span>
            {item.name}. {item.detail}
            {item.completed ? " Complete." : ` ${item.days} days.`}
          </span>
          <button
            data-testid={`start-focus-${item.id}`}
            disabled={!item.available}
            onClick={() => onCommand({ type: "startFocus", focusId: item.id })}
          >
            {item.completed ? "Done" : "Begin"}
          </button>
        </div>
      ))}
    </aside>
  );
}
