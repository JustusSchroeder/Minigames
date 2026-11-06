import { useEffect, useRef } from "react";
import type { CampaignSnapshot } from "@meridian/core";
import { BATTALION_IDS, type BattalionId, type MapMode } from "@meridian/shared";
import { geoMercator } from "d3-geo";
import { feature } from "topojson-client";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import provinceDefs from "../../../../packages/map-data/generated/provinces.json";
import topology from "../../../../packages/map-data/generated/provinces.topology.json";
import earthPlacement from "./earth.json";
import { provinceFill } from "./colors.ts";
import ankylosaurArt from "./units/ankylosaur.png";
import ceratopsArt from "./units/ceratops.png";
import hadrosaurArt from "./units/hadrosaur.png";
import pterosaurArt from "./units/pterosaur.png";
import raptorArt from "./units/raptor.png";
import spinosaurArt from "./units/spinosaur.png";
import stegosaurArt from "./units/stegosaur.png";
import tyrannosaurArt from "./units/tyrannosaur.png";

const SPECIES_ART: Record<BattalionId, string> = {
  hadrosaur: hadrosaurArt,
  raptor: raptorArt,
  ceratops: ceratopsArt,
  tyrannosaur: tyrannosaurArt,
  ankylosaur: ankylosaurArt,
  stegosaur: stegosaurArt,
  pterosaur: pterosaurArt,
  spinosaur: spinosaurArt,
};

const HERD_GROUP = 11;
const MODEL_SIZE = 64;
const MODEL_STEP = 40;
const PACK_STACK = 72;

function herdModels(
  line: Array<{ battalion: BattalionId; count: number }>,
  support: Array<{ battalion: BattalionId; count: number }>,
  lead: BattalionId | null,
): BattalionId[] {
  const models: BattalionId[] = [];
  const slots = [
    ...line
      .filter((slot) => slot.count > 0)
      .sort((left, right) => right.count - left.count || (left.battalion < right.battalion ? -1 : 1)),
    ...support
      .filter((slot) => slot.count > 0)
      .sort((left, right) => (left.battalion < right.battalion ? -1 : 1)),
  ];
  if (slots.length === 0) return lead ? [lead] : [];
  for (const slot of slots) {
    const copies = Math.max(1, Math.ceil(slot.count / HERD_GROUP));
    for (let index = 0; index < copies; index += 1) models.push(slot.battalion);
  }
  return models;
}

interface ProjectedProvince {
  id: string;
  parts: number[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

function outerRings(geometry: {
  type: string;
  coordinates: number[][][] | number[][][][];
}): number[][][] {
  if (geometry.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])[0];
    return ring ? [ring] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).flatMap((polygon) => {
      const ring = polygon[0];
      return ring ? [ring] : [];
    });
  }
  return [];
}

function projectRing(
  ring: number[][],
  project: (lon: number, lat: number) => [number, number] | null,
): number[] {
  const flat: number[] = [];
  const last = ring.length > 1 ? ring.length - 1 : ring.length;
  for (let index = 0; index < last; index += 1) {
    const point = ring[index];
    if (!point) continue;
    const projected = project(point[0] ?? 0, point[1] ?? 0);
    if (!projected) continue;
    flat.push(projected[0], projected[1]);
  }
  return flat;
}

function boundsOf(parts: number[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const flat of parts) {
    for (let index = 0; index < flat.length; index += 2) {
      const x = flat[index] ?? 0;
      const y = flat[index + 1] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function intersects(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  view: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return box.maxX >= view.minX && box.minX <= view.maxX && box.maxY >= view.minY && box.minY <= view.maxY;
}

function pointInFlat(x: number, y: number, flat: number[]): boolean {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i] ?? 0;
    const yi = flat[i + 1] ?? 0;
    const xj = flat[j] ?? 0;
    const yj = flat[j + 1] ?? 0;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function hexColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function trace(shape: Graphics, parts: number[][]): void {
  for (const part of parts) {
    if (part.length >= 6) shape.poly(part, true);
  }
}

export function MapView({
  snapshot,
  mode,
  selectedProvinceId,
  drawingFrontId,
  drawingKind,
  onProvince,
  onMovePoint,
  onStroke,
  onDrawHint,
}: {
  snapshot: CampaignSnapshot;
  mode: MapMode;
  selectedProvinceId: string | null;
  drawingFrontId: string | null;
  drawingKind: "front" | "offensive" | null;
  onProvince: (id: string) => void;
  onMovePoint: (lon: number, lat: number) => void;
  onStroke: (frontId: string, points: Array<{ lon: number; lat: number }>, kind: "front" | "offensive") => void;
  onDrawHint: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{
    draw: (
      snapshot: CampaignSnapshot,
      mode: MapMode,
      selectedProvinceId: string | null,
      drawingFrontId: string | null,
      drawingKind: "front" | "offensive" | null,
    ) => void;
    destroy: () => void;
  } | null>(null);
  const onProvinceRef = useRef(onProvince);
  const onMovePointRef = useRef(onMovePoint);
  const onStrokeRef = useRef(onStroke);
  const onDrawHintRef = useRef(onDrawHint);
  const snapshotRef = useRef(snapshot);
  const modeRef = useRef(mode);
  const selectedRef = useRef(selectedProvinceId);
  const drawingRef = useRef(drawingFrontId);
  const drawingKindRef = useRef(drawingKind);
  onProvinceRef.current = onProvince;
  onMovePointRef.current = onMovePoint;
  onStrokeRef.current = onStroke;
  onDrawHintRef.current = onDrawHint;
  snapshotRef.current = snapshot;
  modeRef.current = mode;
  selectedRef.current = selectedProvinceId;
  drawingRef.current = drawingFrontId;
  drawingKindRef.current = drawingKind;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let ready = false;
    const app = new Application();
    void app
      .init({
        resizeTo: host,
        background: "#1e4d68",
        antialias: false,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
      })
      .then(() => {
        if (dead) {
          app.destroy();
          return;
        }
        host.appendChild(app.canvas);
        apiRef.current = mountMap(
          app,
          host,
          (id) => onProvinceRef.current(id),
          (lon, lat) => onMovePointRef.current(lon, lat),
          (frontId, points, kind) => onStrokeRef.current(frontId, points, kind),
          (message) => onDrawHintRef.current(message),
        );
        apiRef.current.draw(
          snapshotRef.current,
          modeRef.current,
          selectedRef.current,
          drawingRef.current,
          drawingKindRef.current,
        );
        ready = true;
      });
    return () => {
      dead = true;
      if (!ready) return;
      apiRef.current?.destroy();
      apiRef.current = null;
      app.destroy();
    };
    // The Pixi application is created once. Snapshot updates use the draw effect.
  }, []);

  useEffect(() => {
    apiRef.current?.draw(snapshot, mode, selectedProvinceId, drawingFrontId, drawingKind);
  }, [snapshot, mode, selectedProvinceId, drawingFrontId, drawingKind]);

  const mapLabel =
    drawingKind === "offensive"
      ? "Theater map. Drag across land to draw the attack arrow, then release. Press Escape to cancel."
      : drawingKind === "front"
        ? "Theater map. Drag across land to draw the frontline, then release. Press Escape to cancel."
        : "Theater map";

  return (
    <div className="map-host" ref={hostRef} data-testid="theater-map" aria-label={mapLabel}>
      <div className="map-legend" data-testid="map-legend">
        <p className="legend-title">How to read the map</p>
        <ul>
          <li>
            <span className="legend-swatch legend-own" aria-hidden="true" />
            Your packs — gold rounded plate, marked YOURS.
          </li>
          <li>
            <span className="legend-swatch legend-foe" aria-hidden="true" />
            Enemy packs — red pointed plate and the country name.
          </li>
          <li>
            <span className="legend-swatch legend-front" aria-hidden="true" />
            Frontline — hashed red line. Assigned corps hold here.
          </li>
          <li>
            <span className="legend-swatch legend-arrow" aria-hidden="true" />
            Attack arrow — gold, with a head. They go this way after you start the attack.
          </li>
          <li>
            <span className="legend-swatch legend-march" aria-hidden="true" />
            March — dashed cream. One corps moving on its own.
          </li>
        </ul>
      </div>
      <p className="map-note">
        Natural Earth II shaded relief under present-day administrative areas. These are not Cretaceous
        coastlines, and they are not taken from another game.
      </p>
    </div>
  );
}

function simplifyArrow(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const first = points[0];
  if (points.length < 2 || !first) return points;
  const kept: Array<{ x: number; y: number }> = [first];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const previous = kept[kept.length - 1];
    if (!point || !previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 10) continue;
    kept.push(point);
  }
  const tip = points[points.length - 1];
  const previous = kept[kept.length - 1];
  if (tip && previous) {
    if (Math.hypot(tip.x - previous.x, tip.y - previous.y) < 10 && kept.length > 1) kept[kept.length - 1] = tip;
    else if (tip.x !== previous.x || tip.y !== previous.y) kept.push(tip);
  }
  let guard = 0;
  while (kept.length > 2 && guard < 8) {
    guard += 1;
    let removed = false;
    for (let index = 1; index < kept.length - 1; index += 1) {
      const start = kept[index - 1];
      const bend = kept[index];
      const end = kept[index + 1];
      if (!start || !bend || !end) continue;
      const incomingX = bend.x - start.x;
      const incomingY = bend.y - start.y;
      const outgoingX = end.x - bend.x;
      const outgoingY = end.y - bend.y;
      if (incomingX * outgoingX + incomingY * outgoingY <= 0) {
        kept.splice(index, 1);
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }
  return kept;
}

function trimArrow(points: Array<{ x: number; y: number }>, distance: number): Array<{ x: number; y: number }> {
  const trimmed = points.map((point) => ({ x: point.x, y: point.y }));
  let remaining = distance;
  while (trimmed.length >= 2 && remaining > 0) {
    const end = trimmed[trimmed.length - 1];
    const previous = trimmed[trimmed.length - 2];
    if (!end || !previous) break;
    const length = Math.hypot(end.x - previous.x, end.y - previous.y);
    if (length <= 0.001) {
      trimmed.pop();
      continue;
    }
    if (length <= remaining) {
      remaining -= length;
      trimmed.pop();
      continue;
    }
    const scale = (length - remaining) / length;
    trimmed[trimmed.length - 1] = {
      x: previous.x + (end.x - previous.x) * scale,
      y: previous.y + (end.y - previous.y) * scale,
    };
    remaining = 0;
  }
  return trimmed;
}

function polylineLength(points: Array<{ x: number; y: number }>): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous && point) length += Math.hypot(point.x - previous.x, point.y - previous.y);
  }
  return length;
}

function forEachMark(
  points: Array<{ x: number; y: number }>,
  spacing: number,
  start: number,
  visit: (x: number, y: number, angle: number) => void,
): void {
  if (spacing <= 0) return;
  let traveled = 0;
  let next = start;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) continue;
    const angle = Math.atan2(dy, dx);
    while (next <= traveled + length + 0.001) {
      const t = (next - traveled) / length;
      visit(previous.x + dx * t, previous.y + dy * t, angle);
      next += spacing;
    }
    traveled += length;
  }
}

function slotAlong(points: Array<{ x: number; y: number }>, count: number): Array<{ x: number; y: number }> {
  if (count <= 0 || points.length < 2) return [];
  const total = polylineLength(points);
  if (total <= 0) return [];
  if (count === 1) {
    const marks: Array<{ x: number; y: number }> = [];
    forEachMark(points, total, total / 2, (x, y) => marks.push({ x, y }));
    return marks.slice(0, 1);
  }
  const marks: Array<{ x: number; y: number }> = [];
  forEachMark(points, total / (count - 1), 0, (x, y) => marks.push({ x, y }));
  return marks.slice(0, count);
}

function mountMap(
  app: Application,
  host: HTMLElement,
  onProvince: (id: string) => void,
  onMovePoint: (lon: number, lat: number) => void,
  onStroke: (frontId: string, points: Array<{ lon: number; lat: number }>, kind: "front" | "offensive") => void,
  onDrawHint: (message: string) => void,
) {
  const world = new Container();
  const sea = new Graphics();
  const earth = new Sprite();
  const provinceLayer = new Container();
  const markerLayer = new Container();
  markerLayer.sortableChildren = true;
  const labelLayer = new Container();
  const arrowLayer = new Graphics();
  arrowLayer.eventMode = "none";
  earth.eventMode = "none";
  let earthLive = true;
  const earthImage = new Image();
  earthImage.onload = () => {
    if (!earthLive) return;
    earth.texture = Texture.from(earthImage);
    earth.position.set(earthPlacement.x, earthPlacement.y);
    earth.width = earthPlacement.width;
    earth.height = earthPlacement.height;
  };
  earthImage.src = `${import.meta.env.BASE_URL}earth/ne2-europe.jpg`;
  const speciesTextures = new Map<BattalionId, Texture>();
  const flagTextures = new Map<string, Texture>();
  const flagsLoading = new Set<string>();
  let artReady = false;
  const loadSpeciesArt = (done: () => void) => {
    let left = BATTALION_IDS.length;
    const finish = () => {
      left -= 1;
      if (left > 0) return;
      artReady = true;
      done();
    };
    for (const id of BATTALION_IDS) {
      const image = new Image();
      image.onload = () => {
        speciesTextures.set(id, Texture.from(image));
        finish();
      };
      image.onerror = finish;
      image.src = SPECIES_ART[id];
    }
  };
  world.addChild(earth, provinceLayer, markerLayer, labelLayer);
  app.stage.addChild(sea, world, arrowLayer);

  const collection = feature(
    topology as unknown as Parameters<typeof feature>[0],
    topology.objects.provinces as unknown as Parameters<typeof feature>[1],
  );
  const projection = geoMercator().fitExtent(
    [
      [48, 48],
      [2400, 1800],
    ],
    collection,
  );
  const project = (lon: number, lat: number): [number, number] | null => {
    const point = projection([lon, lat]);
    return point ? [point[0], point[1]] : null;
  };
  const invert = (x: number, y: number): { lon: number; lat: number } | null => {
    const point = projection.invert([x, y]);
    return point ? { lon: point[0], lat: point[1] } : null;
  };

  const centers = new Map(provinceDefs.map((province) => [province.id, province.center]));
  const provinces: ProjectedProvince[] = [];
  if (collection.type === "FeatureCollection") {
    for (const item of collection.features) {
      const id = item.properties?.id;
      if (!id) continue;
      const parts = outerRings(item.geometry)
        .map((ring) => projectRing(ring, project))
        .filter((part) => part.length >= 6);
      if (parts.length === 0) continue;
      const box = boundsOf(parts);
      const center = centers.get(id);
      const projectedCenter = center ? project(center.lon, center.lat) : null;
      provinces.push({
        id,
        parts,
        ...box,
        cx: projectedCenter?.[0] ?? (box.minX + box.maxX) / 2,
        cy: projectedCenter?.[1] ?? (box.minY + box.maxY) / 2,
      });
    }
  }

  const graphics = new Map<string, Graphics>();
  const grounds = new Map<string, Graphics>();
  const projectedById = new Map(provinces.map((province) => [province.id, province]));
  for (const province of provinces) {
    const ground = new Graphics();
    trace(ground, province.parts);
    ground.stroke({ width: 1, color: 0x16110c, pixelLine: true, alpha: 0.8 });
    const wash = new Graphics();
    trace(wash, province.parts);
    wash.fill({ color: 0xffffff });
    provinceLayer.addChild(ground, wash);
    grounds.set(province.id, ground);
    graphics.set(province.id, wash);
  }
  const selection = new Graphics();
  const frontInk = new Graphics();
  const routeInk = new Graphics();
  provinceLayer.addChild(selection);
  provinceLayer.addChild(frontInk);
  provinceLayer.addChild(routeInk);

  const camera: Camera = { x: 0, y: 0, zoom: 1 };
  let fitZoom = 1;
  const fit = () => {
    const width = host.clientWidth || 800;
    const height = host.clientHeight || 600;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const province of provinces) {
      minX = Math.min(minX, province.minX);
      minY = Math.min(minY, province.minY);
      maxX = Math.max(maxX, province.maxX);
      maxY = Math.max(maxY, province.maxY);
    }
    const zoom = Math.min((width - 48) / (maxX - minX), (height - 48) / (maxY - minY));
    fitZoom = zoom;
    camera.zoom = zoom;
    camera.x = (width - (maxX - minX) * zoom) / 2 - minX * zoom;
    camera.y = (height - (maxY - minY) * zoom) / 2 - minY * zoom;
  };
  fit();

  const applyCamera = () => {
    world.position.set(camera.x, camera.y);
    world.scale.set(camera.zoom);
  };

  const viewBox = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    return {
      minX: (0 - camera.x) / camera.zoom,
      minY: (0 - camera.y) / camera.zoom,
      maxX: (width - camera.x) / camera.zoom,
      maxY: (height - camera.y) / camera.zoom,
    };
  };

  const cull = () => {
    const view = viewBox();
    for (const province of provinces) {
      const visible = intersects(province, view);
      const ground = grounds.get(province.id);
      if (ground) ground.visible = visible;
      const shape = graphics.get(province.id);
      if (shape) shape.visible = visible;
      const label = labels.get(province.id);
      if (label) label.visible = visible && shownLabels.has(province.id);
      const mark = marks.get(province.id);
      if (mark) mark.visible = visible && shownLabels.has(province.id);
    }
  };

  let latestSnapshot: CampaignSnapshot | null = null;
  let latestMode: MapMode = "political";
  let latestSelected: string | null = null;
  let labelBand = -1;
  let lastLabelZoom = 0;
  const labels = new Map<string, Text>();
  const marks = new Map<string, Graphics>();
  const plates = new Map<string, Container>();
  const shownLabels = new Set<string>();
  const unitCounts = new Map<string, number>();

  const screenScale = () => 1 / Math.max(camera.zoom, 0.05);
  const bandForZoom = () => (camera.zoom > fitZoom * 2.4 ? 2 : camera.zoom > fitZoom * 1.45 ? 1 : 0);

  const paintSea = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    sea.clear();
    sea.rect(0, 0, width, height);
    sea.fill({ color: 0x1e4d68 });
  };

  const recolor = () => {
    if (!latestSnapshot) return;
    const byId = new Map(latestSnapshot.provinces.map((province) => [province.id, province]));
    const colors = new Map(latestSnapshot.countries.map((country) => [country.id, country.color]));
    for (const province of provinces) {
      const shape = graphics.get(province.id);
      const data = byId.get(province.id);
      if (!shape || !data) continue;
      shape.alpha = latestMode === "terrain" ? 0 : latestMode === "political" || latestMode === "control" ? 0.5 : 0.82;
      shape.tint = provinceFill(
        latestMode,
        data,
        colors.get(data.ownerId) ?? "#666666",
        colors.get(data.controllerId) ?? "#666666",
      );
    }
    selection.clear();
    const selected = latestSelected ? projectedById.get(latestSelected) : undefined;
    if (selected) {
      trace(selection, selected.parts);
      selection.stroke({ width: 2, color: 0xe6c56a, pixelLine: true });
    }
    frontInk.clear();
    routeInk.clear();
    if (latestMode === "supply") {
      for (const link of latestSnapshot.supplyRoutes) {
        const from = projectedById.get(link.from);
        const to = projectedById.get(link.to);
        if (!from || !to) continue;
        routeInk.moveTo(from.cx, from.cy);
        routeInk.lineTo(to.cx, to.cy);
        const color = link.kind === "sea" ? 0x8fd4f2 : link.kind === "rail" ? 0xf4f0e6 : 0xe6c56a;
        routeInk.stroke({ width: link.kind === "road" ? 2 : 3, color, alpha: 1, pixelLine: true });
      }
      for (const id of latestSnapshot.supplyHubIds) {
        const hub = projectedById.get(id);
        if (!hub) continue;
        routeInk.circle(hub.cx, hub.cy, 5);
        routeInk.fill({ color: 0xe6c56a });
      }
    }
  };

  const placeLabel = (label: Text, province: ProjectedProvince) => {
    const scale = screenScale();
    const units = unitCounts.get(province.id) ?? 0;
    label.position.set(province.cx, province.cy - (16 + units * PACK_STACK) * scale);
    label.scale.set(scale);
  };

  const syncScales = () => {
    const scale = screenScale();
    for (const [id, label] of labels) {
      if (!shownLabels.has(id)) continue;
      const province = projectedById.get(id);
      if (province) placeLabel(label, province);
    }
    for (const [id, mark] of marks) {
      const province = projectedById.get(id);
      if (!province) continue;
      mark.position.set(province.cx, province.cy);
      mark.scale.set(scale);
    }
    for (const plate of plates.values()) plate.scale.set(scale);
    if (latestSnapshot) {
      const crowded = new Map<string, number>();
      for (const division of latestSnapshot.divisions) {
        const xy = project(division.position.lon, division.position.lat);
        const plate = plates.get(division.id);
        if (!xy || !plate) continue;
        const key = `${xy[0].toFixed(1)}:${xy[1].toFixed(1)}`;
        const index = crowded.get(key) ?? 0;
        crowded.set(key, index + 1);
        plate.position.set(xy[0], xy[1] + index * PACK_STACK * scale);
      }
    }
  };

  const flagTexture = (ref: string) => {
    const cached = flagTextures.get(ref);
    if (cached) return cached;
    if (flagsLoading.has(ref)) return undefined;
    flagsLoading.add(ref);
    const image = new Image();
    image.onload = () => {
      if (!earthLive) return;
      flagTextures.set(ref, Texture.from(image));
      flagsLoading.delete(ref);
      syncMarkers();
    };
    image.onerror = () => flagsLoading.delete(ref);
    image.src = `${import.meta.env.BASE_URL}${ref}`;
    return undefined;
  };

  const unitSide = (countryId: string): "friendly" | "enemy" | "neutral" => {
    if (!latestSnapshot) return "neutral";
    if (countryId === latestSnapshot.playerCountryId) return "friendly";
    const mine = latestSnapshot.playerCountryId;
    const hostile = latestSnapshot.wars.some((war) => {
      const attacker = war.attackers.includes(mine);
      const defender = war.defenders.includes(mine);
      if (!attacker && !defender) return false;
      return (attacker ? war.defenders : war.attackers).includes(countryId);
    });
    return hostile ? "enemy" : "neutral";
  };

  const syncMarkers = () => {
    if (!latestSnapshot) return;
    const colors = new Map(latestSnapshot.countries.map((country) => [country.id, country.color]));
    const names = new Map(latestSnapshot.countries.map((country) => [country.id, country.name]));
    const flags = new Map(latestSnapshot.countries.map((country) => [country.id, country.flagRef]));
    unitCounts.clear();
    for (const division of latestSnapshot.divisions) {
      unitCounts.set(division.provinceId, (unitCounts.get(division.provinceId) ?? 0) + 1);
    }
    const scale = screenScale();
    const seen = new Set<string>();
    const crowded = new Map<string, number>();
    const ordered = [...latestSnapshot.divisions].sort((left, right) => {
      const rank = (id: string) => (id === latestSnapshot?.playerCountryId ? 2 : unitSide(id) === "enemy" ? 1 : 0);
      return rank(left.countryId) - rank(right.countryId);
    });
    for (const division of ordered) {
      const xy = project(division.position.lon, division.position.lat);
      if (!xy) continue;
      seen.add(division.id);
      const key = `${xy[0].toFixed(1)}:${xy[1].toFixed(1)}`;
      const index = crowded.get(key) ?? 0;
      crowded.set(key, index + 1);
      let plate = plates.get(division.id);
      if (!plate) {
        plate = new Container();
        markerLayer.addChild(plate);
        plates.set(division.id, plate);
      }
      for (const child of plate.removeChildren()) {
        child.destroy({ texture: false, textureSource: false });
      }
      const models = herdModels(division.line, division.support, division.leadSpecies);
      const country = colors.get(division.countryId) ?? "#c4a35a";
      const countryName = names.get(division.countryId) ?? division.countryId;
      const side = unitSide(division.countryId);
      const rowWidth = models.length <= 1 ? MODEL_SIZE : MODEL_SIZE + (models.length - 1) * MODEL_STEP;
      const half = Math.max(30, rowWidth / 2 + 10);
      const top = -56;
      const bottom = 20;
      const ink = side === "friendly" ? 0xe0b03a : side === "enemy" ? 0xd94a4a : 0x9a9488;
      const ground = new Graphics();
      if (side === "friendly") {
        ground.roundRect(-half, top, half * 2, bottom - top, 7);
        ground.fill({ color: 0x14110e, alpha: 0.92 });
        ground.stroke({ width: 3.5, color: ink });
        ground.rect(-half, top, 7, bottom - top);
        ground.fill({ color: hexColor(country) });
        ground.poly([0, top - 3, -9, top + 9, 9, top + 9], true);
        ground.fill({ color: ink });
      } else if (side === "enemy") {
        ground.poly(
          [-half, top + 8, 0, top - 6, half, top + 8, half, bottom - 6, 0, bottom + 12, -half, bottom - 6],
          true,
        );
        ground.fill({ color: 0x1a0c0c, alpha: 0.92 });
        ground.stroke({ width: 3.5, color: ink });
        ground.rect(-half + 4, top + 10, half * 2 - 8, 5);
        ground.fill({ color: hexColor(country) });
        ground.poly([0, top + 16, -9, top + 4, 9, top + 4], true);
        ground.fill({ color: ink });
      } else {
        ground.ellipse(0, (top + bottom) / 2, half, (bottom - top) / 2 + 2);
        ground.fill({ color: 0x14110e, alpha: 0.86 });
        ground.stroke({ width: 2.5, color: ink });
      }
      const org = Math.max(0, Math.min(1, division.organization / (division.maxOrganization || 1)));
      const barLeft = -half + 10;
      const barWidth = half * 2 - 20;
      ground.rect(barLeft, 12, barWidth * org, 2);
      ground.fill({ color: 0xe2c56a });
      ground.rect(barLeft, 15, barWidth * Math.max(0, Math.min(1, division.readiness)), 2);
      ground.fill({ color: division.readiness > 0.66 ? 0x7dae45 : division.readiness > 0.33 ? 0xd2a43a : 0xa84838 });
      plate.addChild(ground);
      const start = -((models.length - 1) * MODEL_STEP) / 2;
      for (let slot = 0; slot < models.length; slot += 1) {
        const species = models[slot];
        if (!species) continue;
        const texture = speciesTextures.get(species);
        if (!texture || !artReady) continue;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 0.92);
        sprite.width = MODEL_SIZE;
        sprite.height = MODEL_SIZE;
        sprite.x = start + slot * MODEL_STEP;
        sprite.y = 4;
        plate.addChild(sprite);
      }
      const flagRef = flags.get(division.countryId);
      const flag = flagRef ? flagTexture(flagRef) : undefined;
      if (flag) {
        const banner = new Sprite(flag);
        banner.anchor.set(0, 0.5);
        banner.width = 18;
        banner.height = 12;
        banner.position.set(-half + 10, bottom - 2);
        plate.addChild(banner);
      }
      const label = new Text({
        text: side === "friendly" ? "YOURS" : countryName.toUpperCase(),
        style: {
          fill: side === "friendly" ? "#e6c56a" : side === "enemy" ? "#f6f1e6" : "#d9d0c0",
          fontSize: 11,
          fontFamily: "Georgia, serif",
          fontWeight: "700",
          stroke: { color: "#16110c", width: 4 },
        },
      });
      label.anchor.set(flag ? 0 : 0.5, 0.5);
      label.position.set(flag ? -half + 32 : 0, bottom - 2);
      plate.addChild(label);
      plate.zIndex = side === "friendly" ? 3 : side === "enemy" ? 2 : 1;
      plate.position.set(xy[0], xy[1] + index * PACK_STACK * scale);
      plate.scale.set(scale);
      plate.visible = true;
    }
    for (const [id, plate] of plates) {
      if (seen.has(id)) continue;
      plate.destroy({ children: true, texture: false, textureSource: false });
      plates.delete(id);
    }
  };

  const wantsLabel = (province: ProjectedProvince, victoryPoints: number, band: number) => {
    if (province.id === latestSelected || victoryPoints >= 18) return true;
    if (victoryPoints < 8 || band < 1) return false;
    const width = (province.maxX - province.minX) * camera.zoom;
    const height = (province.maxY - province.minY) * camera.zoom;
    return width >= 48 && height >= 18;
  };

  const syncLabels = () => {
    if (!latestSnapshot) return;
    const band = bandForZoom();
    labelBand = band;
    lastLabelZoom = camera.zoom;
    const byId = new Map(latestSnapshot.provinces.map((province) => [province.id, province]));
    shownLabels.clear();
    for (const province of provinces) {
      const data = byId.get(province.id);
      if (!data || !wantsLabel(province, data.victoryPointValue, band)) continue;
      shownLabels.add(province.id);
      let label = labels.get(province.id);
      if (!label) {
        label = new Text({
          text: data.name,
          style: {
            fill: "#f7f3ea",
            fontSize: data.victoryPointValue >= 18 ? 16 : 12,
            fontFamily: "Georgia, serif",
            stroke: { color: "#16110c", width: 4 },
          },
        });
        label.anchor.set(0.5, 1);
        labelLayer.addChild(label);
        labels.set(province.id, label);
      } else if (label.text !== data.name) {
        label.text = data.name;
      }
      label.visible = true;
      placeLabel(label, province);
      if (data.victoryPointValue > 0) {
        let mark = marks.get(province.id);
        if (!mark) {
          mark = new Graphics();
          mark.rect(-3.5, -3.5, 7, 7);
          mark.fill({ color: 0xf4f0e6 });
          mark.stroke({ width: 1, color: 0x1a140e });
          labelLayer.addChild(mark);
          marks.set(province.id, mark);
        }
        mark.visible = true;
        mark.position.set(province.cx, province.cy);
        mark.scale.set(screenScale());
      }
    }
    for (const [id, label] of labels) label.visible = shownLabels.has(id);
    for (const [id, mark] of marks) mark.visible = shownLabels.has(id);
  };

  let drawFront: string | null = null;
  let drawKind: "front" | "offensive" | null = null;
  let preview: Array<{ x: number; y: number }> = [];

  const projectPoints = (points: Array<{ lon: number; lat: number }>) =>
    points.flatMap((point) => {
      const xy = project(point.lon, point.lat);
      return xy ? [{ x: xy[0], y: xy[1] }] : [];
    });

  const toScreen = (points: Array<{ x: number; y: number }>) =>
    points.map((point) => ({
      x: point.x * camera.zoom + camera.x,
      y: point.y * camera.zoom + camera.y,
    }));

  const strokePath = (
    points: Array<{ x: number; y: number }>,
    width: number,
    color: number,
    alpha: number,
    cap: "butt" | "round" = "round",
  ) => {
    const start = points[0];
    if (!start || points.length < 2) return;
    arrowLayer.beginPath();
    arrowLayer.moveTo(start.x, start.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      if (point) arrowLayer.lineTo(point.x, point.y);
    }
    arrowLayer.stroke({ width, color, cap, join: "round", alpha });
  };

  const paintFrontline = (points: Array<{ x: number; y: number }>, slots: number, preview: boolean) => {
    if (points.length < 2) return;
    const screen = toScreen(points);
    const start = screen[0];
    const end = screen[screen.length - 1];
    if (!start || !end) return;
    const color = preview ? 0xe08a8a : 0xd94a4a;
    strokePath(screen, 12, 0x1a140e, 0.95);
    strokePath(screen, 7, color, preview ? 0.8 : 1);
    forEachMark(screen, 18, 10, (x, y, angle) => {
      const nx = Math.cos(angle + Math.PI / 2);
      const ny = Math.sin(angle + Math.PI / 2);
      arrowLayer.beginPath();
      arrowLayer.moveTo(x - nx * 7, y - ny * 7);
      arrowLayer.lineTo(x + nx * 7, y + ny * 7);
      arrowLayer.stroke({ width: 3, color: 0xf6f1e6, cap: "butt", alpha: preview ? 0.75 : 1 });
    });
    for (const point of [start, end]) {
      arrowLayer.beginPath();
      arrowLayer.rect(point.x - 5, point.y - 5, 10, 10);
      arrowLayer.fill({ color: 0x1a140e, alpha: 0.95 });
      arrowLayer.rect(point.x - 3.5, point.y - 3.5, 7, 7);
      arrowLayer.fill({ color: 0xf6f1e6, alpha: 1 });
    }
    if (!preview && slots > 0) {
      for (const slot of slotAlong(screen, slots)) {
        arrowLayer.beginPath();
        arrowLayer.circle(slot.x, slot.y, 6);
        arrowLayer.fill({ color: 0x1a140e, alpha: 0.95 });
        arrowLayer.circle(slot.x, slot.y, 4);
        arrowLayer.fill({ color: 0xd94a4a, alpha: 1 });
      }
    }
  };

  const paintShaft = (
    points: Array<{ x: number; y: number }>,
    color: number,
    width: number,
    alpha: number,
    chevrons: boolean,
  ) => {
    if (points.length < 2) return;
    const screen = simplifyArrow(toScreen(points));
    const start = screen[0];
    if (!start || screen.length < 2) return;
    const span = polylineLength(screen);
    if (span < 8) return;
    let headLength = Math.min(Math.max(width * 2.5, 18), span * 0.5, 48);
    while (screen.length > 2) {
      const end = screen[screen.length - 1];
      const previous = screen[screen.length - 2];
      if (!end || !previous || Math.hypot(end.x - previous.x, end.y - previous.y) >= headLength) break;
      screen.splice(screen.length - 2, 1);
    }
    const aim = screen[screen.length - 2];
    const end = screen[screen.length - 1];
    if (!aim || !end) return;
    const lastSpan = Math.hypot(end.x - aim.x, end.y - aim.y);
    if (lastSpan < 8) return;
    if (lastSpan < headLength) headLength = lastSpan * 0.72;
    const angle = Math.atan2(end.y - aim.y, end.x - aim.x);
    const half = 0.62;
    const shaft = trimArrow(screen, headLength * Math.cos(half) * 0.78);
    strokePath(shaft, width + 6, 0x1a140e, Math.min(1, alpha + 0.05), "butt");
    strokePath(shaft, width, color, alpha, "butt");
    if (chevrons) {
      const chevronGap = Math.max(22, width * 2.2);
      forEachMark(shaft, chevronGap, chevronGap * 0.7, (x, y, markAngle) => {
        const left = markAngle - 0.7;
        const right = markAngle + 0.7;
        arrowLayer.beginPath();
        arrowLayer.moveTo(x - Math.cos(left) * 8, y - Math.sin(left) * 8);
        arrowLayer.lineTo(x, y);
        arrowLayer.lineTo(x - Math.cos(right) * 8, y - Math.sin(right) * 8);
        arrowLayer.stroke({ width: 3, color: 0x1a140e, cap: "round", join: "round", alpha });
        arrowLayer.beginPath();
        arrowLayer.moveTo(x - Math.cos(left) * 7, y - Math.sin(left) * 7);
        arrowLayer.lineTo(x, y);
        arrowLayer.lineTo(x - Math.cos(right) * 7, y - Math.sin(right) * 7);
        arrowLayer.stroke({ width: 2, color: 0xf6f1e6, cap: "round", join: "round", alpha });
      });
    }
    arrowLayer.beginPath();
    arrowLayer.circle(start.x, start.y, Math.max(5, width * 0.45));
    arrowLayer.fill({ color: 0x1a140e, alpha });
    arrowLayer.circle(start.x, start.y, Math.max(3.5, width * 0.32));
    arrowLayer.fill({ color, alpha });
    arrowLayer.beginPath();
    arrowLayer.moveTo(end.x, end.y);
    arrowLayer.lineTo(end.x - Math.cos(angle - half) * (headLength + 4), end.y - Math.sin(angle - half) * (headLength + 4));
    arrowLayer.lineTo(end.x - Math.cos(angle + half) * (headLength + 4), end.y - Math.sin(angle + half) * (headLength + 4));
    arrowLayer.closePath();
    arrowLayer.fill({ color: 0x1a140e, alpha: Math.min(1, alpha + 0.05) });
    arrowLayer.beginPath();
    arrowLayer.moveTo(end.x, end.y);
    arrowLayer.lineTo(end.x - Math.cos(angle - half) * headLength, end.y - Math.sin(angle - half) * headLength);
    arrowLayer.lineTo(end.x - Math.cos(angle + half) * headLength, end.y - Math.sin(angle + half) * headLength);
    arrowLayer.closePath();
    arrowLayer.fill({ color, alpha });
  };

  const paintMarch = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return;
    const screen = toScreen(points);
    const dash = 10;
    const gap = 7;
    let drawing = true;
    let leftover = dash;
    for (let index = 1; index < screen.length; index += 1) {
      const previous = screen[index - 1];
      const point = screen[index];
      if (!previous || !point) continue;
      let remainX = point.x - previous.x;
      let remainY = point.y - previous.y;
      let remain = Math.hypot(remainX, remainY);
      let cursorX = previous.x;
      let cursorY = previous.y;
      while (remain > 0.001) {
        const take = Math.min(leftover, remain);
        const nx = cursorX + (remainX / remain) * take;
        const ny = cursorY + (remainY / remain) * take;
        if (drawing) {
          arrowLayer.beginPath();
          arrowLayer.moveTo(cursorX, cursorY);
          arrowLayer.lineTo(nx, ny);
          arrowLayer.stroke({ width: 7, color: 0x1a140e, cap: "butt", alpha: 0.9 });
          arrowLayer.beginPath();
          arrowLayer.moveTo(cursorX, cursorY);
          arrowLayer.lineTo(nx, ny);
          arrowLayer.stroke({ width: 4, color: 0xf6f1e6, cap: "butt", alpha: 0.95 });
        }
        leftover -= take;
        remain -= take;
        remainX = point.x - nx;
        remainY = point.y - ny;
        cursorX = nx;
        cursorY = ny;
        if (leftover <= 0.001) {
          drawing = !drawing;
          leftover = drawing ? dash : gap;
        }
      }
    }
  };

  const paintArrows = () => {
    arrowLayer.clear();
    if (drawKind === "offensive") paintShaft(preview, 0xe6c56a, 10, 0.72, true);
    else if (drawKind === "front") paintFrontline(preview, 0, true);
    if (!latestSnapshot) return;
    for (const front of latestSnapshot.fronts) {
      if (front.line.length >= 2) paintFrontline(projectPoints(front.line), front.divisionIds.length, false);
      if (front.offensive && front.offensive.length >= 2) {
        paintShaft(projectPoints(front.offensive), front.executing ? 0xe07040 : 0xe0b03a, 12, 0.96, true);
      }
    }
    const following = new Set(
      latestSnapshot.fronts
        .filter((front) => front.executing && front.offensive && front.offensive.length >= 2)
        .flatMap((front) => front.divisionIds),
    );
    for (const division of latestSnapshot.divisions) {
      if (division.countryId !== latestSnapshot.playerCountryId || !division.orderPath) continue;
      if (following.has(division.id)) continue;
      paintMarch(projectPoints(division.orderPath));
    }
  };

  const refresh = () => {
    paintSea();
    recolor();
    syncMarkers();
    syncLabels();
    applyCamera();
    cull();
    paintArrows();
  };
  loadSpeciesArt(() => {
    if (latestSnapshot) syncMarkers();
  });

  let userAdjusted = false;
  let dragging = false;
  let moved = false;
  let fromMap = false;
  let stroking = false;
  let stroke: Array<{ x: number; y: number }> = [];
  let lastX = 0;
  let lastY = 0;
  const canvas = app.canvas;
  canvas.style.touchAction = "none";
  canvas.setAttribute("aria-hidden", "true");
  const worldPoint = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - camera.x) / camera.zoom,
      y: (event.clientY - rect.top - camera.y) / camera.zoom,
    };
  };
  const provinceAt = (x: number, y: number) => {
    const view = viewBox();
    for (let index = provinces.length - 1; index >= 0; index -= 1) {
      const province = provinces[index];
      if (!province || !intersects(province, view)) continue;
      if (province.parts.some((part) => pointInFlat(x, y, part))) return province.id;
    }
    return null;
  };
  const onDown = (event: PointerEvent) => {
    fromMap = event.target === canvas;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    if (fromMap && drawFront) {
      stroking = true;
      dragging = false;
      if (canvas.hasPointerCapture?.(event.pointerId) !== true) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* pointer capture is best-effort */
        }
      }
      stroke = [worldPoint(event)];
      preview = stroke;
      paintArrows();
      return;
    }
    dragging = fromMap;
  };
  const onMove = (event: PointerEvent) => {
    if (stroking) {
      const point = worldPoint(event);
      const last = stroke[stroke.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) >= 12) stroke.push(point);
      const end = stroke[stroke.length - 1];
      preview = end && (end.x !== point.x || end.y !== point.y) ? [...stroke, point] : stroke;
      paintArrows();
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.hypot(dx, dy) > 3) {
      moved = true;
      userAdjusted = true;
    }
    camera.x += dx;
    camera.y += dy;
    lastX = event.clientX;
    lastY = event.clientY;
    applyCamera();
    scheduleView();
  };
  const finishStroke = (event: PointerEvent) => {
    if (!stroking) return;
    stroking = false;
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    const release = worldPoint(event);
    const last = stroke[stroke.length - 1];
    if (!last || last.x !== release.x || last.y !== release.y) stroke.push(release);
    const samples: Array<{ x: number; y: number }> = [];
    const first = stroke[0];
    if (first) samples.push(first);
    let previous = first;
    for (const point of stroke) {
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 24) continue;
      samples.push(point);
      previous = point;
    }
    const end = stroke[stroke.length - 1];
    if (end && previous && (end.x !== previous.x || end.y !== previous.y)) samples.push(end);
    const points = samples.flatMap((point) => {
      if (!provinceAt(point.x, point.y)) return [];
      const geo = invert(point.x, point.y);
      return geo ? [geo] : [];
    });
    const frontId = drawFront;
    const kind = drawKind;
    stroke = [];
    preview = [];
    paintArrows();
    if (frontId && kind && points.length >= 2) {
      onStroke(frontId, points, kind);
      return;
    }
    onDrawHint(
      kind === "offensive"
        ? "That attack arrow was too short or over water. Drag a longer line across land."
        : "That frontline was too short or over water. Drag a longer line across land.",
    );
  };
  const abortStroke = () => {
    if (!stroking && preview.length === 0) return;
    stroking = false;
    stroke = [];
    preview = [];
    paintArrows();
  };
  const onUp = (event: PointerEvent) => {
    if (stroking) {
      finishStroke(event);
      return;
    }
    const select = fromMap;
    fromMap = false;
    dragging = false;
    if (!select || moved) return;
    const point = worldPoint(event);
    const id = provinceAt(point.x, point.y);
    if (id) onProvince(id);
    const geo = invert(point.x, point.y);
    if (geo && id) onMovePoint(geo.lon, geo.lat);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    userAdjusted = true;
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const worldX = (sx - camera.x) / camera.zoom;
    const worldY = (sy - camera.y) / camera.zoom;
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * rect.height : event.deltaY;
    const next = Math.min(fitZoom * 12, Math.max(fitZoom * 0.35, camera.zoom * Math.exp(-pixels * 0.0015)));
    camera.x = sx - worldX * next;
    camera.y = sy - worldY * next;
    camera.zoom = next;
    applyCamera();
    scheduleView();
  };
  let viewFrame = 0;
  const scheduleView = () => {
    if (viewFrame) return;
    viewFrame = requestAnimationFrame(() => {
      viewFrame = 0;
      const ratio = lastLabelZoom > 0 ? camera.zoom / lastLabelZoom : 1;
      if (bandForZoom() !== labelBand || ratio > 1.25 || ratio < 0.8) syncLabels();
      syncScales();
      cull();
      paintArrows();
    });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    abortStroke();
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", abortStroke);
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const resizeObserver = new ResizeObserver(() => {
    app.resize();
    if (!userAdjusted) fit();
    paintSea();
    syncScales();
    applyCamera();
    cull();
    paintArrows();
  });
  resizeObserver.observe(host);

  return {
    draw(
      snapshot: CampaignSnapshot,
      mode: MapMode,
      selectedProvinceId: string | null,
      drawingFrontId: string | null,
      drawingKind: "front" | "offensive" | null,
    ) {
      latestSnapshot = snapshot;
      latestMode = mode;
      latestSelected = selectedProvinceId;
      drawFront = drawingFrontId;
      drawKind = drawingKind;
      canvas.style.cursor = drawingFrontId ? "crosshair" : "grab";
      refresh();
    },
    destroy() {
      earthLive = false;
      if (viewFrame) cancelAnimationFrame(viewFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", abortStroke);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("wheel", onWheel);
      world.destroy({ children: true });
      sea.destroy();
      arrowLayer.destroy();
    },
  };
}
