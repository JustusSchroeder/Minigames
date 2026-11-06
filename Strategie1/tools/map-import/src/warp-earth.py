"""Warp Natural Earth II into the game's mercator frame.

The source is the public-domain 1:50m Natural Earth II shaded relief
(NE2_50M_SR_W). The output jpg is what the map draws under the country colors.
Run from the repo root:

  python3 tools/map-import/src/warp-earth.py /path/to/NE2_50M_SR_W.tif
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
BOX = (48.0, 48.0, 2400.0, 1800.0)
PAD = 1.2
OUT_W = 6400
TIFF_PIXEL = 1.0 / 30.0
TIFF_ORIGIN_LON = -179.98333333333333
TIFF_ORIGIN_LAT = 89.98333333333333


def projection() -> tuple[float, float, float]:
    script = r"""
import { geoMercator } from "d3-geo";
import { feature } from "topojson-client";
import { readFileSync } from "fs";
const topology = JSON.parse(readFileSync("packages/map-data/generated/provinces.topology.json", "utf8"));
const collection = feature(topology, topology.objects.provinces);
const projection = geoMercator().fitExtent([[48, 48], [2400, 1800]], collection);
const [tx, ty] = projection.translate();
process.stdout.write(JSON.stringify({ scale: projection.scale(), tx, ty }));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    return float(data["scale"]), float(data["tx"]), float(data["ty"])


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: warp-earth.py NE2_50M_SR_W.tif")
    scale, tx, ty = projection()
    x0, y0, x1, y1 = BOX
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    half_w = (x1 - x0) * (0.5 + PAD)
    half_h = (y1 - y0) * (0.5 + PAD)
    left = cx - half_w
    top = cy - half_h
    width = half_w * 2
    height = half_h * 2
    out_h = round(OUT_W * height / width)

    Image.MAX_IMAGE_PIXELS = None
    source = np.asarray(Image.open(sys.argv[1]).convert("RGB"))
    src_h, src_w = source.shape[:2]
    output = np.empty((out_h, OUT_W, 3), dtype=np.uint8)
    columns = np.linspace(0.5, OUT_W - 0.5, OUT_W, dtype=np.float32)
    world_x = left + columns * (width / OUT_W)
    lam = (world_x - tx) / scale

    for start in range(0, out_h, 96):
        stop = min(out_h, start + 96)
        rows = np.arange(start, stop, dtype=np.float32) + 0.5
        world_y = top + rows * (height / out_h)
        merc_y = (ty - world_y) / scale
        phi = np.arctan(np.sinh(merc_y))
        lat = np.degrees(phi)[:, None]
        lon = np.degrees(lam)[None, :]
        col = (lon - TIFF_ORIGIN_LON) / TIFF_PIXEL
        row = (TIFF_ORIGIN_LAT - lat) / TIFF_PIXEL
        c0 = np.floor(col).astype(np.int32)
        r0 = np.floor(row).astype(np.int32)
        cw = (col - c0).astype(np.float32)[..., None]
        rw = (row - r0).astype(np.float32)[..., None]
        c0 = np.clip(c0, 0, src_w - 2)
        r0 = np.clip(r0, 0, src_h - 2)
        c1 = c0 + 1
        r1 = r0 + 1
        p00 = source[r0, c0].astype(np.float32)
        p10 = source[r0, c1].astype(np.float32)
        p01 = source[r1, c0].astype(np.float32)
        p11 = source[r1, c1].astype(np.float32)
        top_px = p00 * (1 - cw) + p10 * cw
        bot_px = p01 * (1 - cw) + p11 * cw
        output[start:stop] = np.clip(top_px * (1 - rw) + bot_px * rw, 0, 255).astype(np.uint8)
        print(f"{stop}/{out_h}", flush=True)

    image_dir = ROOT / "apps" / "web" / "public" / "earth"
    image_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(output).save(image_dir / "ne2-europe.jpg", quality=86, optimize=True)
    placement = {"x": left, "y": top, "width": width, "height": height}
    (ROOT / "apps" / "web" / "src" / "map" / "earth.json").write_text(json.dumps(placement) + "\n")
    print(placement, (image_dir / "ne2-europe.jpg").stat().st_size)


if __name__ == "__main__":
    main()
