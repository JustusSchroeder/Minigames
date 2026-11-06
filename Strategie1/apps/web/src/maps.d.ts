declare module "d3-geo" {
  export interface GeoProjection {
    (point: [number, number]): [number, number] | null;
    invert(point: [number, number]): [number, number] | null;
    fitExtent(
      extent: [[number, number], [number, number]],
      object: unknown,
    ): GeoProjection;
  }
  export function geoMercator(): GeoProjection;
  export function geoArea(object: unknown): number;
}

declare module "topojson-client" {
  export function feature(
    topology: unknown,
    object: unknown,
  ): {
    type: string;
    features: Array<{
      type: string;
      properties: { id?: string; name?: string } | null;
      geometry:
        | { type: "Polygon"; coordinates: number[][][] }
        | { type: "MultiPolygon"; coordinates: number[][][][] }
        | { type: string; coordinates: never };
    }>;
  };
}

declare module "topojson-server" {
  export function topology(objects: unknown): unknown;
}
