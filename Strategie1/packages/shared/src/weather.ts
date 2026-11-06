import type { ClimateRegion } from "./constants.ts";

export const WEATHERS = ["clear", "rain", "mud", "snow"] as const;
export type Weather = (typeof WEATHERS)[number];

/** Attack multiplier. Snow and mud slow an offensive; defense is unchanged. */
export const WEATHER_ATTACK: Record<Weather, number> = {
  clear: 1,
  rain: 0.9,
  mud: 0.75,
  snow: 0.6,
};

/** Travel-time multiplier applied when an order is issued and at each new leg. */
export const WEATHER_MOVE: Record<Weather, number> = {
  clear: 1,
  rain: 1.15,
  mud: 1.45,
  snow: 1.6,
};

const LABELS: Record<Weather, string> = {
  clear: "Clear",
  rain: "Rain",
  mud: "Mud",
  snow: "Snow",
};

export function weatherLabel(weather: Weather): string {
  return LABELS[weather];
}

/** Month 9 (the Maastrichtian opening) is clear. Winter snows inland, and the thaw months are mud. */
export function weatherAt(month: number, climate: ClimateRegion): Weather {
  if (month === 12 || month === 1 || month === 2) {
    return climate === "oceanic" ? "rain" : "snow";
  }
  if (month === 3 || month === 11) return "mud";
  if (month === 4 || month === 10) return "rain";
  return "clear";
}
