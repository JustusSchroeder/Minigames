export const GRID = {
  originLon: 13.8,
  originLat: 49.15,
  dLon: 1.25,
  dLat: 0.78,
  cols: 9,
  rows: 8,
} as const;

export const KNOWN_OWNERS = ["germany", "poland", "slovakia", "danzig"] as const;

/** Row 0 is the southern edge. Characters are owners; a dot is outside the theater. */
export const ROW_PATTERN = [
  "..SSSPPPP",
  "GGGPPPPPP",
  "GGGPPPPPP",
  "GGPPPPPPP",
  "GGPPPPPPP",
  "GGGPPPPP.",
  ".GGDGGG..",
  "....GGG..",
] as const;

const OWNER = {
  G: "germany",
  P: "poland",
  S: "slovakia",
  D: "danzig",
} as const;

const NAMES: Record<string, string> = {
  "4,7": "Samland",
  "5,7": "Nadruvia",
  "6,7": "Memel Flats",
  "1,6": "Oder Mouth",
  "2,6": "Stolp Heath",
  "3,6": "Danzig",
  "4,6": "Elbing",
  "5,6": "Königsberg",
  "6,6": "Insterburg",
  "0,5": "Uckermark",
  "1,5": "Pomeranian Lakes",
  "2,5": "Schneidemühl",
  "3,5": "Tuchola",
  "4,5": "Mława",
  "5,5": "Łomża",
  "6,5": "Augustów",
  "7,5": "Grodno Edge",
  "0,4": "Berlin",
  "1,4": "Frankfurt an der Oder",
  "2,4": "Poznań",
  "3,4": "Gniezno",
  "4,4": "Łowicz",
  "5,4": "Warsaw",
  "6,4": "Siedlce",
  "7,4": "Brest Edge",
  "8,4": "Pinsk Fringe",
  "0,3": "Cottbus",
  "1,3": "Glogau",
  "2,3": "Kalisz",
  "3,3": "Sieradz",
  "4,3": "Łódź",
  "5,3": "Radom",
  "6,3": "Lublin",
  "7,3": "Chełm",
  "8,3": "Kowel Edge",
  "0,2": "Bautzen",
  "1,2": "Liegnitz",
  "2,2": "Breslau",
  "3,2": "Częstochowa",
  "4,2": "Kielce",
  "5,2": "Sandomierz",
  "6,2": "Rzeszów",
  "7,2": "Lwów",
  "8,2": "Tarnopol Edge",
  "0,1": "Erzgebirge",
  "1,1": "Sudeten Ridge",
  "2,1": "Ostrau",
  "3,1": "Teschen",
  "4,1": "Kraków",
  "5,1": "Tarnów",
  "6,1": "Przemyśl",
  "7,1": "Drohobycz",
  "8,1": "Stanisławów",
  "2,0": "Trenčín",
  "3,0": "Žilina",
  "4,0": "Poprad",
  "5,0": "Nowy Sącz",
  "6,0": "Sanok",
  "7,0": "Sambor",
  "8,0": "Kolomyja",
};

const TERRAIN: Record<string, "plains" | "forest" | "hills" | "mountains" | "urban" | "marsh"> = {
  "0,4": "urban",
  "5,4": "urban",
  "3,6": "urban",
  "4,1": "urban",
  "7,2": "urban",
  "5,6": "urban",
  "0,1": "hills",
  "1,1": "hills",
  "2,1": "hills",
  "3,5": "forest",
  "6,5": "forest",
  "8,1": "forest",
  "8,2": "forest",
  "8,3": "forest",
  "8,5": "marsh",
  "8,4": "marsh",
};

const INFRASTRUCTURE: Record<string, number> = {
  "0,4": 5,
  "5,4": 4,
  "2,2": 4,
  "5,6": 3,
  "3,6": 3,
  "4,1": 3,
  "2,4": 3,
  "4,3": 3,
};

const VICTORY: Record<string, number> = {
  "0,4": 25,
  "5,4": 20,
  "3,6": 8,
  "4,1": 8,
  "7,2": 6,
  "2,4": 5,
  "4,3": 5,
  "5,6": 4,
  "2,2": 4,
  "2,0": 3,
};

const RESOURCES: Record<string, { resource: "steel" | "aluminum" | "oil" | "tungsten" | "chromium"; amount: number }[]> = {
  "2,2": [{ resource: "steel", amount: 12 }],
  "1,2": [{ resource: "steel", amount: 8 }],
  "2,1": [{ resource: "steel", amount: 10 }],
  "7,1": [{ resource: "oil", amount: 6 }],
  "8,1": [{ resource: "oil", amount: 4 }],
  "4,0": [{ resource: "tungsten", amount: 2 }],
  "1,1": [{ resource: "chromium", amount: 2 }],
  "0,1": [{ resource: "aluminum", amount: 2 }],
};

const RIVER = new Set(["3,5", "4,4", "4,3", "5,2", "5,1"]);

export interface TheaterCell {
  id: string;
  col: number;
  row: number;
  name: string;
  countryId: string;
  terrain: "plains" | "forest" | "hills" | "mountains" | "urban" | "marsh";
  climate: "oceanic" | "continental" | "alpine";
  infrastructureLevel: number;
  victoryPointValue: number;
  resources: { resource: "steel" | "aluminum" | "oil" | "rubber" | "tungsten" | "chromium"; amount: number }[];
  strategicTags: string[];
}

export function theaterCells(): TheaterCell[] {
  const cells: TheaterCell[] = [];
  for (let row = 0; row < ROW_PATTERN.length; row += 1) {
    const pattern = ROW_PATTERN[row] ?? "";
    for (let col = 0; col < pattern.length; col += 1) {
      const mark = pattern[col];
      if (!mark || mark === ".") continue;
      const owner = OWNER[mark as keyof typeof OWNER];
      const key = `${col},${row}`;
      const name = NAMES[key];
      if (!owner || !name) throw new Error(`Missing theater data for ${key}`);
      const tags = ["theater"];
      if (RIVER.has(key)) tags.push("river");
      if (row >= 6) tags.push("coast");
      if ((VICTORY[key] ?? 0) >= 20) tags.push("capital");
      const terrain = row === 0 ? "mountains" : (TERRAIN[key] ?? (col >= 8 ? "forest" : "plains"));
      const climate = row === 0 ? "alpine" : row >= 6 ? "oceanic" : "continental";
      const defaultInfra = col >= 7 ? 1 : owner === "germany" ? 4 : 2;
      cells.push({
        id: `c${col}r${row}`,
        col,
        row,
        name,
        countryId: owner,
        terrain,
        climate,
        infrastructureLevel: INFRASTRUCTURE[key] ?? defaultInfra,
        victoryPointValue: VICTORY[key] ?? 0,
        resources: RESOURCES[key] ?? [],
        strategicTags: tags,
      });
    }
  }
  return cells;
}
