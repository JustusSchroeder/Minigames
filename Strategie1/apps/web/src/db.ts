import Dexie, { type Table } from "dexie";
import type { SaveFile } from "@meridian/shared";

export interface SaveRow {
  id: string;
  name: string;
  updatedAt: string;
  summary: string;
  data: SaveFile;
}

class MeridianDatabase extends Dexie {
  saves!: Table<SaveRow, string>;

  constructor() {
    super("meridian-front");
    this.version(1).stores({
      saves: "id, updatedAt",
    });
  }
}

export const db = new MeridianDatabase();

export async function listSaves(): Promise<SaveRow[]> {
  return db.saves.orderBy("updatedAt").reverse().toArray();
}
