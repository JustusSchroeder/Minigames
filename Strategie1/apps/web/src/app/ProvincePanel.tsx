import { useMemo, useState } from "react";
import { resourceLabel } from "../map/colors.ts";
import { useUi } from "../state/uiStore.ts";

export function ProvincePanel({ onProvince }: { onProvince: (id: string) => void }) {
  const snapshot = useUi((state) => state.snapshot);
  const selectedId = useUi((state) => state.selectedProvinceId);
  const report = useUi((state) => state.report);
  const error = useUi((state) => state.error);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const provinces = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return snapshot.provinces
      .filter((province) => province.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [query, snapshot]);
  if (!snapshot) return null;
  const selected = snapshot.provinces.find((province) => province.id === selectedId) ?? null;
  const country = (id: string) => snapshot.countries.find((item) => item.id === id);
  const owner = selected ? country(selected.ownerId) : undefined;
  const controller = selected ? country(selected.controllerId) : undefined;
  const present = selected
    ? snapshot.divisions.filter(
        (division) => division.provinceId === selected.id || division.battleId?.includes(selected.id),
      )
    : [];

  return (
    <aside className="panel province-dock">
      <div className="panel-heading">
        <h2>Province</h2>
        <button
          data-testid="province-find"
          aria-expanded={finding}
          onClick={() => setFinding((open) => !open)}
        >
          Find
        </button>
      </div>
      {finding ? (
        <input
          className="search"
          data-testid="province-search"
          placeholder="Name"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      {finding && query.trim() ? (
        <div className="find-results">
          {provinces.length === 0 ? <p className="muted">No province matches.</p> : null}
          {provinces.map((province) => (
            <button
              key={province.id}
              className="list-button"
              data-testid={`province-${province.id}`}
              aria-pressed={province.id === selectedId}
              onClick={() => {
                onProvince(province.id);
                setFinding(false);
                setQuery("");
              }}
            >
              {province.name}
            </button>
          ))}
        </div>
      ) : null}
      {selected ? (
        <section data-testid="province-panel">
          <h3>{selected.name}</h3>
          <p>{relationText(snapshot, selected.ownerId, selected.controllerId, owner?.name, controller?.name)}</p>
          <div className="stat-grid">
            <span>Terrain</span>
            <span>{selected.terrain}</span>
            <span>Roads</span>
            <span>{selected.infrastructure} of 10</span>
            <span>Forts</span>
            <span>{selected.forts}</span>
            <span>Railway</span>
            <span>{selected.rail}</span>
            <span>Port</span>
            <span>{selected.port}</span>
            <span>Supply hub</span>
            <span>{selected.supplyHub ? "Yes" : "No"}</span>
            <span>Resources</span>
            <span>{resourceLabel(selected.resources)}</span>
          </div>
          <p>{supplyText(selected, selected.controllerId === snapshot.playerCountryId)}</p>
          {present.length > 0 ? (
            <p>Present: {present.map((division) => division.name).join(", ")}</p>
          ) : (
            <p className="muted">No formations are stationed here.</p>
          )}
        </section>
      ) : (
        <p className="muted">Select a province on the map, or use Find.</p>
      )}
      {report ? (
        <p className="report" data-testid="order-report">
          {report}
        </p>
      ) : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </aside>
  );
}

function atWarWith(snapshot: NonNullable<ReturnType<typeof useUi.getState>["snapshot"]>, otherId: string): boolean {
  const mine = snapshot.playerCountryId;
  return snapshot.wars.some((war) => {
    const left = war.attackers.includes(mine);
    const right = war.defenders.includes(mine);
    if (!left && !right) return false;
    return left ? war.defenders.includes(otherId) : war.attackers.includes(otherId);
  });
}

function relationText(
  snapshot: NonNullable<ReturnType<typeof useUi.getState>["snapshot"]>,
  ownerId: string,
  controllerId: string,
  ownerName: string | undefined,
  controllerName: string | undefined,
): string {
  const owner = ownerName ?? ownerId;
  const holder = controllerName ?? controllerId;
  const mine = snapshot.playerCountryId;
  if (controllerId === mine && ownerId === mine) return "Your land. A corps can move here freely.";
  if (controllerId === mine) return `You occupy this. ${owner} still owns it.`;
  if (atWarWith(snapshot, controllerId)) {
    return `Enemy land, held by ${holder}. With Attack or move armed, clicking this province sends your selected corps here. Defenders start a battle. An empty province is occupied.`;
  }
  return `Neutral land, held by ${holder}. Your army cannot enter, and you cannot declare war.`;
}

function supplyText(
  province: {
    supplyConnected: boolean;
    supplyRatio: number;
    supplyDemand: number;
  },
  mine: boolean,
): string {
  if (!mine) {
    if (!province.supplyConnected) return "No supply reaches the country holding this province.";
    if (province.supplyDemand <= 0) return "The holder has this province on their supply network. None of their units are drawing it.";
    if (province.supplyRatio < 1) return "The holder's units here are short of supply.";
    return "The holder's units here are supplied.";
  }
  if (!province.supplyConnected) {
    return "No supply reaches this province. A railway, a port, or a hub inside truck range has to connect it to your capital.";
  }
  if (province.supplyDemand <= 0) return "On your supply network. Nothing here is using it.";
  if (province.supplyRatio < 1) {
    return "Short of supply. The route from the nearest hub is too thin for the units here, so they fight worse.";
  }
  return "Supplied. The route from your network can feed the units here.";
}
