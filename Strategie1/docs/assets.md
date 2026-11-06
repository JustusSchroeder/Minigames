# Assets

| Asset | Path | Source | License | Attribution |
| --- | --- | --- | --- | --- |
| Land polygons, 1:110m | `packages/map-data/source/ne_110m_land.geojson` | Natural Earth, naturalearthdata.com | Public domain. No permission required. | Made with Natural Earth. |
| Generated land copy | `packages/map-data/generated/land.geojson` and `land.json` | Derived from the file above by the map build | Public domain | Made with Natural Earth. |
| Europe administrative areas | `packages/map-data/source/europe-admin1.geojson` and the generated province files | Natural Earth 1:10m admin-1, v5.1.2, clipped to the European frame. Present-day boundaries, not a 1939 historical layer and not another game's map. | Public domain | Made with Natural Earth. |
| Earth relief under the country colors | `apps/web/public/earth/ne2-europe.jpg` | Natural Earth II with shaded relief, 1:50m (`NE2_50M_SR_W`), warped into this map's mercator frame. Regenerate with `python3 tools/map-import/src/warp-earth.py` and the source tif. | Public domain | Made with Natural Earth. |
| Rhenish, Holy Cross, and Carpathian banners | `apps/web/public/flags/germany.svg`, `poland.svg`, `slovakia.svg` | Original drawings: forest ridges and a river for the Massif, a sea-and-cross of ridges for the Island, three peaks for the Ridge | Original | None. They are not national flags and are not taken from another game. |
| Neutral banner | `apps/web/public/flags/neutral.svg` | Original nest mark on slate | Original | None. |

No font files, audio, portraits, or third-party icons are shipped. The interface uses Georgia and the system sans serif.

University of Minnesota historical boundaries and GPL historical basemaps were not imported. Their redistribution terms are narrower than this project should assume.
