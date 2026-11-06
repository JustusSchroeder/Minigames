import {
  advanceSimulation,
  createCampaign,
  createSave,
  issueCommand,
  loadSave,
  snapshot,
  type Campaign,
} from "@meridian/core";
import { september1939 } from "@meridian/content";
import { commandSchema, type Command, type SaveFile } from "@meridian/shared";

let campaign: Campaign | null = null;

interface Envelope {
  id: number;
  type: string;
  playerCountryId?: string;
  seed?: number;
  hours?: number;
  name?: string;
  command?: Command;
  save?: SaveFile;
}

function post(id: number, payload: Record<string, unknown>): void {
  self.postMessage({ id, ...payload });
}

self.onmessage = (event: MessageEvent<Envelope>) => {
  const message = event.data;
  try {
    if (message.type === "start") {
      if (!message.playerCountryId || !Number.isInteger(message.seed)) {
        throw new Error("A player country and integer seed are required.");
      }
      campaign = createCampaign({
        scenario: september1939,
        playerCountryId: message.playerCountryId,
        seed: message.seed,
      });
      post(message.id, { type: "snapshot", snapshot: snapshot(campaign), report: null });
      return;
    }
    if (message.type === "load") {
      campaign = loadSave(message.save, september1939);
      post(message.id, { type: "snapshot", snapshot: snapshot(campaign), report: "Campaign restored." });
      return;
    }
    if (!campaign) throw new Error("No campaign is running.");
    if (message.type === "advance") {
      const hours = message.hours ?? 0;
      const advanced = advanceSimulation(campaign, hours);
      campaign = advanced.campaign;
      post(message.id, {
        type: "snapshot",
        snapshot: snapshot(campaign),
        report: advanced.report.lines.at(-1) ?? null,
      });
      return;
    }
    if (message.type === "command") {
      const command = commandSchema.parse(message.command);
      const issued = issueCommand(campaign, command);
      campaign = issued.campaign;
      post(message.id, {
        type: "snapshot",
        snapshot: snapshot(campaign),
        report: issued.result.ok ? issued.result.summary : issued.result.reason ?? issued.result.summary,
      });
      return;
    }
    if (message.type === "save") {
      const save = createSave(campaign, message.name);
      post(message.id, { type: "saved", save });
      return;
    }
    throw new Error(`Unknown simulation message ${message.type}`);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Simulation error";
    post(message.id, { type: "error", message: text });
  }
};
