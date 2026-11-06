import type { CampaignSnapshot } from "@meridian/core";
import type { Command, SaveFile } from "@meridian/shared";

export type WorkerResponse =
  | { type: "snapshot"; snapshot: CampaignSnapshot; report: string | null }
  | { type: "saved"; save: SaveFile }
  | { type: "error"; message: string };

type WorkerRequest =
  | { type: "start"; playerCountryId: string; seed: number }
  | { type: "advance"; hours: number }
  | { type: "command"; command: Command }
  | { type: "save"; name: string }
  | { type: "load"; save: SaveFile };

interface Pending {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
}

export interface SimClient {
  send: (message: WorkerRequest) => Promise<WorkerResponse>;
}

export function createSimClient(): SimClient {
  const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, Pending>();
  let sequence = 1;
  let chain: Promise<void> = Promise.resolve();

  worker.onmessage = (event: MessageEvent<WorkerResponse & { id: number }>) => {
    const waiter = pending.get(event.data.id);
    if (!waiter) return;
    pending.delete(event.data.id);
    if (event.data.type === "error") waiter.reject(new Error(event.data.message));
    else waiter.resolve(event.data);
  };

  return {
    send(message) {
      const run = chain.then(
        () =>
          new Promise<WorkerResponse>((resolve, reject) => {
            const id = sequence;
            sequence += 1;
            pending.set(id, { resolve, reject });
            worker.postMessage({ ...message, id });
          }),
      );
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

let client: SimClient | null = null;

export function simClient(): SimClient {
  if (!client) client = createSimClient();
  return client;
}
