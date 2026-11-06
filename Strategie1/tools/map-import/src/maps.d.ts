declare module "d3-geo" {
  export function geoArea(object: unknown): number;
}

declare module "topojson-client" {
  export function feature(topology: unknown, object: unknown): unknown;
  export function neighbors(objects: unknown[]): number[][];
}

declare module "topojson-server" {
  export function topology(objects: unknown, quantization?: number): unknown;
}
