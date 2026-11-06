import type { CampaignSnapshot } from "@meridian/core";
import { BATTALIONS, type Command } from "@meridian/shared";
import { useUi } from "../state/uiStore.ts";

function enemyNames(snapshot: CampaignSnapshot): string[] {
  const mine = snapshot.playerCountryId;
  const names = new Map(snapshot.countries.map((country) => [country.id, country.name]));
  const ids = new Set<string>();
  for (const war of snapshot.wars) {
    const opposing = war.attackers.includes(mine)
      ? war.defenders
      : war.defenders.includes(mine)
        ? war.attackers
        : [];
    for (const id of opposing) ids.add(id);
  }
  return [...ids].map((id) => names.get(id) ?? id);
}

export function DivisionList({ onCommand }: { onCommand: (command: Command) => void }) {
  const snapshot = useUi((state) => state.snapshot);
  const selectedId = useUi((state) => state.selectedDivisionId);
  const setSelected = useUi((state) => state.setSelectedDivisionId);
  const orderArmed = useUi((state) => state.orderArmed);
  const setOrderArmed = useUi((state) => state.setOrderArmed);
  if (!snapshot) return null;
  const divisions = snapshot.divisions.filter((division) => division.countryId === snapshot.playerCountryId);
  const selected = divisions.find((division) => division.id === selectedId) ?? null;
  const place = (provinceId: string) =>
    snapshot.provinces.find((province) => province.id === provinceId)?.name ?? "the map";
  const enemies = enemyNames(snapshot);
  const battles = snapshot.battles.filter(
    (battle) => battle.attackers.some((id) => divisions.some((division) => division.id === id))
      || battle.defenders.some((id) => divisions.some((division) => division.id === id)),
  );
  return (
    <>
    <aside className="panel outliner">
      <h2>Your army</h2>
      <p className="war-note">
        {enemies.length > 0
          ? `At war with ${enemies.join(" and ")}. Your corps can enter their land. Everyone else is neutral, and an order into neutral land is refused.`
          : "You are not at war. Your corps can only move through your own land."}
        {snapshot.paused ? " Time is paused, so press Play before an order can move." : ""}
      </p>
      {battles.length > 0 ? (
        <p>
          {battles.map((battle) => `Battle in ${battle.provinceName}.`).join(" ")} The side that runs out of
          organization retreats.
        </p>
      ) : null}
      {!selected ? (
        <ol className="steps">
          <li>Open a front, then draw the red hashed frontline on the map.</li>
          <li>Select a corps and assign it. Each assigned corps walks to its own place on that line.</li>
          <li>Draw a gold attack arrow toward the land you want, then press Start the attack.</li>
          <li>Press Play. Nothing moves while the clock is paused.</li>
        </ol>
      ) : null}
      {divisions.map((division) => (
        <button
          key={division.id}
          className="division-button"
          data-testid={`division-${division.id}`}
          aria-pressed={division.id === selectedId}
          onClick={() => setSelected(division.id)}
        >
          {division.name}
          <div className="muted">
            {division.battleId ? `Fighting in ${place(division.provinceId)}` : `In ${place(division.provinceId)}`}
            {division.orderText ? "" : division.battleId ? "" : " · waiting"}
          </div>
        </button>
      ))}
      {selected ? (
        <div>
          <p data-testid="division-order">
            {selected.orderText ??
              (selected.battleId
                ? `Fighting in ${place(selected.provinceId)}.`
                : `Standing in ${place(selected.provinceId)}. No order yet.`)}
          </p>
          <p className="muted">
            {selected.templateName}
            {selected.leadSpecies ? ` · ${BATTALIONS[selected.leadSpecies].name}` : ""}.{" "}
            {selected.manpower.toLocaleString()} handlers. Supply {Math.round(selected.supplyRatio * 100)}%. Fighting
            strength {selected.organization.toFixed(0)} of {selected.maxOrganization}. Entrenchment{" "}
            {selected.entrenchment.toFixed(0)}. Armor {selected.armor.toFixed(1)}, piercing {selected.piercing.toFixed(1)}.
            At zero, the pack retreats.
          </p>
          <div className="choice-row">
            <button data-testid="issue-move" aria-pressed={orderArmed} onClick={() => setOrderArmed(!orderArmed)}>
              {orderArmed ? "Now click a point on the map" : "Move this corps by hand"}
            </button>
            <button onClick={() => onCommand({ type: "cancelMove", divisionId: selected.id })}>Halt this corps</button>
          </div>
        </div>
      ) : (
        <p className="muted">No corps is selected.</p>
      )}
    </aside>
    <FrontOrders onCommand={onCommand} selectedDivisionId={selectedId} />
    </>
  );
}

function DrawTool({
  frontId,
  kind,
  idle,
  busy,
  label,
}: {
  frontId: string;
  kind: "front" | "offensive";
  idle: string;
  busy: string;
  label: string;
}) {
  const drawingFrontId = useUi((state) => state.drawingFrontId);
  const drawingKind = useUi((state) => state.drawingKind);
  const setDrawingFrontId = useUi((state) => state.setDrawingFrontId);
  const drawing = drawingFrontId === frontId && drawingKind === kind;
  return (
    <button
      type="button"
      data-testid={kind === "front" ? `draw-front-${frontId}` : `draw-offensive-${frontId}`}
      aria-pressed={drawing}
      aria-label={drawing ? `${label}. Drawing is on. Drag on the map, or press Escape to cancel.` : label}
      onClick={() => setDrawingFrontId(drawing ? null : frontId, drawing ? null : kind)}
    >
      {drawing ? busy : idle}
    </button>
  );
}

function FrontOrders({
  onCommand,
  selectedDivisionId,
}: {
  onCommand: (command: Command) => void;
  selectedDivisionId: string | null;
}) {
  const snapshot = useUi((state) => state.snapshot);
  if (!snapshot) return null;
  const mine = snapshot.playerCountryId;
  const enemies = new Set<string>();
  for (const war of snapshot.wars) {
    const opposing = war.attackers.includes(mine)
      ? war.defenders
      : war.defenders.includes(mine)
        ? war.attackers
        : [];
    for (const id of opposing) enemies.add(id);
  }
  if (enemies.size === 0) return null;
  return (
    <aside className="panel front-dock" data-testid="front-panel">
      <h3>The front</h3>
      <p className="muted">
        The hashed red line is the frontline: assigned corps hold there. The gold arrow with a head is the attack: they
        follow it only after you start the attack. Shape marks the difference, not only color.
      </p>
      {[...enemies].map((enemyId) => {
        const front = snapshot.fronts.find((item) => item.enemyId === enemyId);
        const enemy = snapshot.countries.find((country) => country.id === enemyId)?.name ?? enemyId;
        if (!front) {
          return (
            <button
              key={enemyId}
              data-testid={`open-front-${enemyId}`}
              onClick={() => onCommand({ type: "createFront", enemyId })}
            >
              Open a front against {enemy}
            </button>
          );
        }
        return (
          <div key={front.id}>
            <p data-testid={`front-gaps-${enemyId}`}>
              {front.line.length >= 2
                ? `Frontline set with ${front.line.length} points. ${front.divisionIds.length} assigned.`
                : `No frontline yet. ${front.divisionIds.length} assigned. Draw the line on the map.`}
            </p>
            <p data-testid={`front-plan-${enemyId}`}>
              {front.offensive && front.offensive.length > 0
                ? front.executing
                  ? `Advancing along an attack line of ${front.offensive.length} points.`
                  : `Attack arrow set with ${front.offensive.length} points. Waiting to start the attack.`
                : "No arrow yet."}
            </p>
            <div className="choice-row">
              <button
                type="button"
                data-testid={`assign-front-${enemyId}`}
                disabled={!selectedDivisionId}
                aria-label={
                  selectedDivisionId
                    ? `Assign the selected corps to the front against ${enemy}`
                    : `Select a corps first, then assign it to the front against ${enemy}`
                }
                onClick={() =>
                  selectedDivisionId
                    ? onCommand({ type: "assignFront", frontId: front.id, divisionId: selectedDivisionId })
                    : undefined
                }
              >
                Assign this corps
              </button>
              <DrawTool
                frontId={front.id}
                kind="front"
                idle="Draw frontline"
                busy="Drag the line"
                label={`Draw the frontline against ${enemy}`}
              />
              <DrawTool
                frontId={front.id}
                kind="offensive"
                idle="Draw attack arrow"
                busy="Drag the arrow"
                label={`Draw the attack arrow against ${enemy}`}
              />
            </div>
            <div className="choice-row">
              <button
                type="button"
                data-testid={`execute-front-${enemyId}`}
                disabled={!front.offensive || front.offensive.length < 2}
                aria-label={`Start the attack against ${enemy}. Assigned corps follow the gold arrow.`}
                onClick={() => onCommand({ type: "executeFront", frontId: front.id })}
              >
                Start the attack
              </button>
              <button
                type="button"
                data-testid={`clear-offensive-${enemyId}`}
                disabled={!front.offensive}
                aria-label={`Clear the attack arrow against ${enemy}`}
                onClick={() => onCommand({ type: "cancelOffensive", frontId: front.id })}
              >
                Clear arrow
              </button>
              <button
                type="button"
                data-testid={`delete-front-${enemyId}`}
                aria-label={`Close the front against ${enemy}`}
                onClick={() => onCommand({ type: "deleteFront", frontId: front.id })}
              >
                Close front
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
