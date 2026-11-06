import { useEffect, useRef, useState } from "react";
import { BATTALIONS, BATTALION_IDS, type BattalionId, type Command } from "@meridian/shared";
import { useUi } from "../state/uiStore.ts";

function show(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function speciesHint(id: BattalionId): string {
  const stats = BATTALIONS[id];
  const bits = [
    `${stats.softAttack} soft`,
    `${stats.hardAttack} hard`,
    `${stats.defense} def`,
    `${stats.breakthrough} brk`,
  ];
  if (stats.armor > 0) bits.push(`${stats.armor} armor`);
  if (stats.digsIn) bits.push("digs in");
  return bits.join(" · ");
}

export function DesignerPanel({ onCommand }: { onCommand: (command: Command) => void }) {
  const snapshot = useUi((state) => state.snapshot);
  const selectedProvinceId = useUi((state) => state.selectedProvinceId);
  const templates = snapshot?.templates ?? [];
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? "");
  const [newTemplateName, setNewTemplateName] = useState("New template");
  const [divisionName, setDivisionName] = useState("New division");
  const [factoryText, setFactoryText] = useState(String(snapshot?.industry.lines[0]?.factories ?? 0));
  const template = templates.find((item) => item.id === templateId) ?? templates[0];
  const selected = snapshot?.provinces.find((province) => province.id === selectedProvinceId);
  const canRecruit = selected?.controllerId === snapshot?.playerCountryId;
  const assignedFactories = snapshot?.industry.lines[0]?.factories ?? 0;
  const seenTemplates = useRef<Set<string> | null>(null);

  useEffect(() => {
    const ids = templates.map((item) => item.id);
    const seen = seenTemplates.current;
    if (seen) {
      const created = ids.find((id) => !seen.has(id));
      if (created) setTemplateId(created);
    }
    seenTemplates.current = new Set(ids);
    if (!ids.includes(templateId)) setTemplateId(ids[0] ?? "");
  }, [templateId, templates]);

  useEffect(() => {
    if (template) setTemplateName(template.name);
  }, [template?.id, template?.name]);

  useEffect(() => {
    setFactoryText(String(assignedFactories));
  }, [assignedFactories]);

  if (!snapshot || !template) return null;
  const player = snapshot.countries.find((country) => country.id === snapshot.playerCountryId);

  function count(role: "line" | "support", battalion: BattalionId): number {
    const slots = role === "line" ? template?.line : template?.support;
    return slots?.find((slot) => slot.battalion === battalion)?.count ?? 0;
  }

  function setCount(role: "line" | "support", battalion: BattalionId, next: number) {
    onCommand({ type: "setBattalion", templateId: template?.id ?? "", role, battalion, count: Math.max(0, next) });
  }

  return (
    <aside className="panel industry-dock" data-testid="designer-panel">
      <h2>Recruit a pack</h2>
      <p className="muted">
        This changes which dinosaurs a new pack is made of, then raises it on a province you control. It does not
        move troops. To attack, use the Your army panel.
      </p>
      <label>
        Template{" "}
        <select value={template.id} onChange={(event) => setTemplateId(event.target.value)}>
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="choice-row">
        <input
          className="search"
          value={templateName}
          maxLength={40}
          onChange={(event) => setTemplateName(event.target.value)}
        />
        <button
          onClick={() => onCommand({ type: "renameTemplate", templateId: template.id, name: templateName.trim() })}
        >
          Rename
        </button>
      </div>
      <h3>Line species</h3>
      {BATTALION_IDS.filter((id) => BATTALIONS[id].role === "line").map((id) => (
        <div className="stepper" key={id}>
          <strong title={speciesHint(id)}>{BATTALIONS[id].name}</strong>
          <span>
            <button aria-label={`Remove ${BATTALIONS[id].name}`} onClick={() => setCount("line", id, count("line", id) - 1)}>
              −
            </button>{" "}
            <span data-testid={`battalion-count-${id}`}>{count("line", id)}</span>{" "}
            <button
              data-testid={`battalion-add-${id}`}
              aria-label={`Add ${BATTALIONS[id].name}`}
              onClick={() => setCount("line", id, count("line", id) + 1)}
            >
              +
            </button>
          </span>
        </div>
      ))}
      <h3>Support species</h3>
      {BATTALION_IDS.filter((id) => BATTALIONS[id].role === "support").map((id) => (
        <div className="stepper" key={id}>
          <strong title={speciesHint(id)}>{BATTALIONS[id].name}</strong>
          <span>
            <button
              aria-label={`Remove ${BATTALIONS[id].name}`}
              onClick={() => setCount("support", id, 0)}
            >
              −
            </button>{" "}
            <span>{count("support", id)}</span>{" "}
            <button
              aria-label={`Add ${BATTALIONS[id].name}`}
              onClick={() => setCount("support", id, 1)}
            >
              +
            </button>
          </span>
        </div>
      ))}
      <div className="stat-grid" data-testid="designer-stats">
        <span>Soft attack</span>
        <span data-testid="designer-soft-attack">{show(template.softAttack)}</span>
        <span>Hard attack</span>
        <span>{show(template.hardAttack)}</span>
        <span>Defense</span>
        <span>{show(template.defense)}</span>
        <span>Breakthrough</span>
        <span>{show(template.breakthrough)}</span>
        <span>Organization</span>
        <span>{template.organization}</span>
        <span>Combat width</span>
        <span>{template.combatWidth}</span>
        <span>Handlers</span>
        <span>{template.manpower.toLocaleString()}</span>
        <span>Harness</span>
        <span>{template.equipment.toLocaleString()}</span>
        <span>Supply use</span>
        <span>{template.supplyUse}</span>
        <span>Production cost</span>
        <span>{template.productionSteel.toLocaleString()} steel</span>
        <span>Armor</span>
        <span>{show(template.armor)}</span>
        <span>Piercing</span>
        <span>{show(template.piercing)}</span>
      </div>
      <h3>Recruit</h3>
      <p className="muted" data-testid="designer-pool" data-equipment={player?.stockpile.infantry_equipment ?? 0}>
        Pool {(player?.manpower ?? 0).toLocaleString()} handlers · {(player?.stockpile.infantry_equipment ?? 0).toLocaleString()}{" "}
        harness. {selected ? `Selected province: ${selected.name}.` : "Select a controlled province on the map."}
      </p>
      <div className="choice-row">
        <input
          className="search"
          data-testid="recruit-name"
          value={divisionName}
          maxLength={40}
          onChange={(event) => setDivisionName(event.target.value)}
        />
        <button
          data-testid="recruit-division"
          disabled={!canRecruit || !divisionName.trim()}
          onClick={() => {
            if (!selected) return;
            onCommand({
              type: "recruitDivision",
              templateId: template.id,
              provinceId: selected.id,
              name: divisionName.trim(),
            });
          }}
        >
          Raise pack
        </button>
      </div>
      <h3>Equipment production</h3>
      <p className="muted">
        Every species draws harness. Assign military factories to that line. Each item costs 2 steel.
      </p>
      <div className="choice-row">
        <input
          className="search narrow"
          value={factoryText}
          inputMode="numeric"
          onChange={(event) => setFactoryText(event.target.value)}
        />
        <button
          onClick={() => {
            const parsed = Number(factoryText);
            if (!Number.isInteger(parsed) || parsed < 0) return;
            onCommand({ type: "setProduction", equipment: "infantry_equipment", factories: parsed });
          }}
        >
          Assign factories
        </button>
      </div>
      <h3>New template</h3>
      <div className="choice-row">
        <input className="search" value={newTemplateName} maxLength={40} onChange={(event) => setNewTemplateName(event.target.value)} />
        <button
          onClick={() => onCommand({ type: "createTemplate", name: newTemplateName.trim() || "New template" })}
        >
          Create
        </button>
      </div>
    </aside>
  );
}
