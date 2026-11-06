# Map coverage

The playable map is Europe, the Mediterranean shore, and the nearest parts of North Africa and European Russia. Province shapes are present-day Natural Earth 1:10m administrative areas (admin-1). They are real coastlines and real internal borders. They are not Cretaceous coastlines, and they are not a province file from another game.

The Rhenish Massif, Holy Cross Island, and Carpathian Ridge keep the Maastrichtian scenario stats. Those names are the Late Cretaceous landmasses that occupied the present-day German, Polish, and Slovak polygons. Every other government on the map is neutral and exists so the land has an owner and a color. There is no separate Free City of Danzig polygon in this source, and present-day Germany does not include a detached East Prussia. Supply follows the present-day land borders.

Britain, Ireland, Iceland, Malta, Cyprus, and other areas that do not touch the continental mesh are tagged `island`. They stay on the map and keep their own internal roads. The connectivity check ignores that tag so a real island is not treated as a broken import. North Africa is tagged the same way because the Strait of Gibraltar is not a land border.

The Masovian voivodeship is labeled Warsaw, and other national capitals use the capital city's name. The polygon is still the administrative area that contains that city.

## Checks

`tools/map-import` fails the build if it finds duplicate ids, missing country references, invalid rings, self-intersections on compact rings, one-way adjacency, an enclosed province tagged as coast, or a continental province cut off from the main land mesh. Shared borders come from a TopoJSON topology, so neighboring fills meet. The client projects that topology with d3-geo.

## Source

The extract is `packages/map-data/source/europe-admin1.geojson`, clipped to about 26°W–48°E and 30°N–72°N from Natural Earth `ne_10m_admin_1_states_provinces`, version 5.1.2. Arkhangelsk is cut at that frame so Siberia does not pull the camera off Europe.
