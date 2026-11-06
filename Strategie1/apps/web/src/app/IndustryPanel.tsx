import { useEffect, useState } from "react";
import type { Command, ResourceId } from "@meridian/shared";
import { useUi } from "../state/uiStore.ts";

const RESOURCE_LABELS: Record<ResourceId, string> = {
  steel: "Steel",
  aluminum: "Aluminum",
  oil: "Oil",
  rubber: "Rubber",
  tungsten: "Tungsten",
  chromium: "Chromium",
};

export function IndustryPanel({ onCommand }: { onCommand: (command: Command) => void }) {
  const snapshot = useUi((state) => state.snapshot);
  const selectedProvinceId = useUi((state) => state.selectedProvinceId);
  const industry = snapshot?.industry;
  const line = industry?.lines[0];
  const [factoryText, setFactoryText] = useState(String(line?.factories ?? 0));
  const [partnerId, setPartnerId] = useState(industry?.partners[0]?.id ?? "");
  const partner = industry?.partners.find((item) => item.id === partnerId) ?? industry?.partners[0];
  const [resource, setResource] = useState<ResourceId>(partner?.resources[0] ?? "steel");
  const [tradeFactories, setTradeFactories] = useState("1");

  useEffect(() => {
    setFactoryText(String(line?.factories ?? 0));
  }, [line?.factories]);

  useEffect(() => {
    if (!industry?.partners.some((item) => item.id === partnerId)) {
      setPartnerId(industry?.partners[0]?.id ?? "");
    }
  }, [industry?.partners, partnerId]);

  useEffect(() => {
    if (!partner) return;
    if (!partner.resources.includes(resource)) setResource(partner.resources[0] ?? "steel");
  }, [partner, resource]);

  if (!snapshot || !industry) return null;
  const selected = snapshot.provinces.find((province) => province.id === selectedProvinceId);
  const canBuildInfrastructure = selected?.controllerId === snapshot.playerCountryId;

  return (
    <aside className="panel industry-dock" data-testid="industry-panel">
      <h2>Industry</h2>
      <p className="muted">
        Civilian factories build or buy imports. Military factories add equipment to the stockpile at midnight.
        Formations do not receive it automatically.
      </p>
      <div className="stat-grid">
        <span>Civilian</span>
        <span>
          {industry.buildingCivilian} building · {industry.idleCivilian} idle · {industry.tradeFactories} trading ·{" "}
          {industry.civilianFactories} total
        </span>
        <span>Military</span>
        <span>
          {industry.assignedMilitary} producing · {industry.idleMilitary} idle · {industry.militaryFactories} total
        </span>
        <span>Dockyards</span>
        <span>{industry.dockyards} · ships are not built yet</span>
        <span>Transport</span>
        <span>
          {industry.transportUsed} of {industry.transportCapacity} import units
        </span>
      </div>
      <h3>Stockpile and daily extraction</h3>
      <div className="stat-grid">
        {(Object.keys(RESOURCE_LABELS) as ResourceId[]).map((id) => (
          <span key={id}>
            {RESOURCE_LABELS[id]} {industry.stockpile[id].toLocaleString()} · +{industry.extraction[id]}
          </span>
        ))}
        <span>Harness {industry.stockpile.infantry_equipment.toLocaleString()}</span>
      </div>
      <h3>Construction</h3>
      <div className="choice-row">
        <button data-testid="build-civilian" onClick={() => onCommand({ type: "queueConstruction", kind: "civilian_factory", provinceId: null })}>
          Civilian factory
        </button>
        <button data-testid="build-military" onClick={() => onCommand({ type: "queueConstruction", kind: "military_factory", provinceId: null })}>
          Military factory
        </button>
        <button
          data-testid="build-infrastructure"
          disabled={!canBuildInfrastructure}
          onClick={() =>
            selected
              ? onCommand({ type: "queueConstruction", kind: "infrastructure", provinceId: selected.id })
              : undefined
          }
        >
          Infrastructure{selected && canBuildInfrastructure ? ` in ${selected.name}` : ""}
        </button>
        <button
          data-testid="build-fort"
          disabled={!canBuildInfrastructure}
          onClick={() =>
            selected ? onCommand({ type: "queueConstruction", kind: "fort", provinceId: selected.id }) : undefined
          }
        >
          Fort{selected && canBuildInfrastructure ? ` in ${selected.name}` : ""}
        </button>
        <button
          data-testid="build-rail"
          disabled={!canBuildInfrastructure}
          onClick={() =>
            selected ? onCommand({ type: "queueConstruction", kind: "rail", provinceId: selected.id }) : undefined
          }
        >
          Railway{selected && canBuildInfrastructure ? ` in ${selected.name}` : ""}
        </button>
        <button
          data-testid="build-port"
          disabled={!canBuildInfrastructure || !selected?.coastal}
          onClick={() =>
            selected ? onCommand({ type: "queueConstruction", kind: "port", provinceId: selected.id }) : undefined
          }
        >
          Port{selected?.coastal ? ` in ${selected.name}` : ""}
        </button>
        <button
          data-testid="build-hub"
          disabled={!canBuildInfrastructure || selected?.supplyHub === true}
          onClick={() =>
            selected ? onCommand({ type: "queueConstruction", kind: "supply_hub", provinceId: selected.id }) : undefined
          }
        >
          Supply hub{selected && canBuildInfrastructure && !selected.supplyHub ? ` in ${selected.name}` : ""}
        </button>
      </div>
      {canBuildInfrastructure ? null : (
        <p className="muted">Infrastructure needs a province you control. Select one on the map, or use Find in the province panel.</p>
      )}
      {industry.projects.length === 0 ? <p className="muted">The construction queue is empty.</p> : null}
      {industry.projects.map((project) => (
        <div key={project.id} className="queue-row" data-testid={`project-${project.id}`}>
          <div>
            <strong>{project.label}</strong>
            <span>
              {project.progress} / {project.cost}
              {project.daysRemaining !== null
                ? ` · ${project.factories} factories · ${project.daysRemaining} days`
                : " · no factories assigned"}
            </span>
          </div>
          <button onClick={() => onCommand({ type: "cancelConstruction", projectId: project.id })}>Cancel</button>
        </div>
      ))}
      <h3>Production</h3>
      <p>
        Harness costs {line?.recipe ?? "2 steel"}. Efficiency{" "}
        {Math.round((line?.efficiency ?? 0.5) * 100)}%. Next midnight delivers {line?.output ?? 0}
        {line?.short ? ` of ${line.potential} because resources are short` : ""}.
      </p>
      <div className="choice-row">
        <input
          className="search narrow"
          data-testid="production-factories"
          inputMode="numeric"
          value={factoryText}
          onChange={(event) => setFactoryText(event.target.value)}
        />
        <button
          data-testid="production-apply"
          onClick={() => {
            const factories = Number(factoryText);
            if (!Number.isInteger(factories) || factories < 0) return;
            onCommand({ type: "setProduction", equipment: "infantry_equipment", factories });
          }}
        >
          Assign factories
        </button>
      </div>
      <h3>Trade</h3>
      {industry.routes.map((route) => (
        <div key={route.id} className="queue-row">
          <div>
            <strong>
              {RESOURCE_LABELS[route.resource]} from {route.partnerName}
            </strong>
            <span>
              {route.factories} civilian {route.factories === 1 ? "factory" : "factories"} · {route.delivered}{" "}
              arriving at midnight
              {route.ends ? " · ends because the countries are at war" : ""}
            </span>
          </div>
          <button data-testid={`close-trade-${route.id}`} onClick={() => onCommand({ type: "closeTrade", tradeId: route.id })}>
            Close
          </button>
        </div>
      ))}
      {industry.partners.length === 0 ? (
        <p className="muted">No partner has a resource you can import.</p>
      ) : (
        <div className="choice-row">
          <select data-testid="trade-partner" value={partner?.id ?? ""} onChange={(event) => setPartnerId(event.target.value)}>
            {industry.partners.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            data-testid="trade-resource"
            value={resource}
            onChange={(event) => setResource(event.target.value as ResourceId)}
          >
            {(partner?.resources ?? []).map((id) => (
              <option key={id} value={id}>
                {RESOURCE_LABELS[id]}
              </option>
            ))}
          </select>
          <input
            className="search narrow"
            data-testid="trade-factories"
            inputMode="numeric"
            value={tradeFactories}
            onChange={(event) => setTradeFactories(event.target.value)}
          />
          <button
            data-testid="trade-open"
            onClick={() => {
              const factories = Number(tradeFactories);
              if (!partner || !Number.isInteger(factories) || factories < 1) return;
              onCommand({ type: "openTrade", partnerId: partner.id, resource, factories });
            }}
          >
            Open import
          </button>
        </div>
      )}
    </aside>
  );
}
