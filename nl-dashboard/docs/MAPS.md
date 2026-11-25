# Superset maps: what Superset 5.0 does, and what Lenspack needs

Notes from studying a stock Superset 5.0 and its point-map chart (`deck_scatter`), done before adding maps to Lenspack.
The method was read-only: a saved chart's params, a headless browser's network log while the chart renders, the
data endpoints called directly, and Superset's own source (`superset/viz.py`, the frontend bundle). Every value in
this note is a placeholder.

**Status:** point maps ([section 7](#7-what-lenspack-does-with-this-point-maps)) are built and are in Lenspack's
`main` ([`packages/hosts/superset`](https://github.com/theflywheel/lenspack/tree/main/packages/hosts/superset)). Section 6
describes Lenspack before them. Shaded-area maps (choropleths, section 4) are not built.

## 1. A scatter map's form data (`deck_scatter`)

This is a saved chart's `params` after the chart was made in Explore (Superset's chart builder). The
`query_context` is empty.

```json
{
  "datasource": "19__table",
  "viz_type": "deck_scatter",
  "spatial": { "type": "latlong", "latCol": "latitude", "lonCol": "longitude" },
  "point_radius_fixed": { "type": "fix", "value": 1500 },
  "point_unit": "square_m",
  "min_radius": 4, "max_radius": 30, "multiplier": 1,
  "color_picker": { "r": 31, "g": 119, "b": 180, "a": 1 },
  "mapbox_style": "mapbox://styles/mapbox/light-v9",
  "autozoom": true,
  "row_limit": 5000,
  "adhoc_filters": [],
  "time_range": "No filter"
}
```

When Explore renders the chart, it also sends these defaults: `filter_nulls: true`,
`viewport {longitude, latitude, zoom, bearing, pitch}`, `legend_position: "tr"`,
`legend_format: "SMART_NUMBER"`, `color_scheme: "supersetColors"`, `js_columns: []`,
`time_grain_sqla: null`, `extra_form_data: {}`.

**Required:** only `datasource`, `viz_type` and `spatial`. A form data holding just those three renders, with
a fixed radius of 500 (`DeckScatterViz.query_obj`), every row up to the row limit, and the frontend's
defaults for everything else.

**Optional, and what each one does:**

| key | effect |
|---|---|
| `spatial.type` | `latlong` (two columns), `delimited` (one `"lon,lat"` column, `lonlatCol`) or `geohash` (`geohashCol`); `reverseCheckbox` swaps lat and lon |
| `point_radius_fixed` | `{type: "fix", value: n}` gives every point the same radius. `{type: "metric", value: <metric>}` sizes each point by an aggregate and makes the query a GROUP BY over lon, lat, `dimension` and `js_columns` |
| `point_unit` | `square_m`, `radius_m`, `radius_km`, `radius_miles`, `square_km`, `square_miles`, `pixels` |
| `min_radius`, `max_radius`, `multiplier` | pixel clamps and a scale on the radius |
| `dimension` | a column whose values colour the points by category (`color_scheme`), with a legend |
| `color_picker` | the single colour used when there is no `dimension` |
| `js_columns` | extra columns carried on each feature, for the `js_*` hooks |
| `js_data_mutator`, `js_tooltip`, `js_onclick_href` | JavaScript strings; only run when `ENABLE_JAVASCRIPT_CONTROLS` is on (it is off here) |
| `time_grain_sqla` | turns the map into a time-animated one (`__timestamp` on each feature) |
| `autozoom` | fits the viewport to the points; otherwise `viewport` is used |
| `filter_nulls` | default true: adds `latitude IS NOT NULL` and `longitude IS NOT NULL` to the query |
| `row_limit`, `adhoc_filters`, `time_range` | as in every chart |

## 2. How Superset fetches the data

`deck_scatter` is still a **legacy chart**: its class is marked `@deprecated(deprecated_in="3.0")` but it is
the only path. When the chart renders, the browser sends

```
POST /superset/explore_json/?form_data={"slice_id":51}
     multipart body: form_data=<the full form data>
```

It does **not** call `/api/v1/chart/data`, and no `query_context` is needed or used. What follows for us:

- **Writing:** a chart Lenspack creates needs only `viz_type: "deck_scatter"`, `params` (the form data above)
  and `datasource_id`/`datasource_type: "table"`. Writing `query_context: null` is fine.
- **Reading:** `explore_json` refuses a JWT bearer token (401 "Access is Denied"); it wants a browser session.
  Lenspack shouldn't call it. `/api/v1/chart/data` with an ordinary table query on the same dataset
  (`columns: [lat, lon, …]`, `row_limit`) works with the token and returns the rows. That is how Lenspack
  reads a map's data, the same way it reads tables today.

## 3. Response shapes

`GET /api/v1/chart/<id>` returns `viz_type: "deck_scatter"`, `params` as a JSON string (section 1) and
`query_context: null`. It also returns `datasource_id: null`: the dataset is only in `params.datasource`
(`"19__table"`).

`explore_json` (shapes only):

```
{ status, query (the SQL), rowcount, colnames, coltypes, cache_key, is_cached,
  applied_filters: [{column}] (here the two IS NOT NULL filters), rejected_filters: [],
  form_data: {…, where, having, filters},
  data: { features: [ { position: [lon, lat], radius, metric, cat_color, __timestamp, extraProps? } ],
          mapboxApiKey: "<the server's key, sent to every viewer>",
          metricLabels: [] } }
```

- `position` is **[longitude, latitude]**, in deck.gl's order.
- `radius` is the fixed value, or the metric's value per point; `metric` is null without one.
- `cat_color` is the `dimension` value (null without one); `extraProps` holds the `js_columns`.
- There is **no truncation flag**. The only hint is `rowcount == row_limit`.

`/api/v1/chart/data` with a raw table query returns the usual `result[0].{colnames, coltypes, data: [{col:
value}], rowcount, sql_rowcount}`.

## 4. The other map types

| viz_type | needs | what it draws |
|---|---|---|
| `deck_scatter` | `spatial` (points) | points; size fixed or by metric; category colour |
| `deck_screengrid`, `deck_grid`, `deck_hex`, `deck_heatmap`, `deck_contour` | `spatial` (points), `size` metric | density of points: screen cells, grid squares, hexagons, heat, contours |
| `deck_arc` | `start_spatial`, `end_spatial`, optional `dimension` | arcs between two points per row (a referral from A to B) |
| `deck_path` | `line_column` + `line_type` (`polyline`, `json`, `geohash`) | one line per row from an encoded path column |
| `deck_polygon` | `line_column` + `line_type` (a polygon per row, as JSON or polyline), `metric`, colour scale | **a choropleth**: shaded polygons |
| `deck_geojson` | `geojson`: a column holding a GeoJSON feature per row | GeoJSON shapes, with styling read from properties |
| `deck_multi` | `deck_slices`: other saved deck charts | layers several deck charts on one map |
| `country_map` | `select_country`, `entity` (ISO 3166-2 code column), `metric` | admin-1 shading from shapes in the bundle; Nigeria is included, at **state level only** |

**For choropleths later:** `deck_polygon` and `deck_geojson` both want the shape **in a column of the dataset**,
one row per area. Superset has no join to an outside boundary file. Ward or LGA shading would need:

1. a boundary set, for example GRID3 ward boundaries;
2. loaded as a table (ward code or name, polygon as GeoJSON text) in the warehouse;
3. joined to the coverage data in a virtual dataset;
4. a `deck_polygon` chart over it.

The join key is the hard part: ward names are spelled differently across sources, so codes are better.
`country_map` works today for **states**, keyed on ISO codes such as `NG-XX`.

## 5. Basemaps and the Mapbox key

- Superset reads `MAPBOX_API_KEY` from the environment (`config.py`) and sends it to the browser inside every
  deck chart's data (`data.mapboxApiKey`). It is a public token by design: anyone who can view a map can read
  it. It should be a URL-restricted public token.
- Superset 5.0 has **no setting for non-Mapbox tiles** for deck.gl. The style field offers six Mapbox styles
  (Streets, Dark, Light, Satellite Streets, Satellite, Outdoors). It accepts free text, but a validator requires
  `mapbox://styles/…`. Later versions add `DECKGL_BASE_MAP`; 5.0 doesn't have it. The OpenStreetMap WMS in the
  bundle belongs to a different plugin.
- The default CSP allows `connect-src` to `api.mapbox.com` and `events.mapbox.com` only, so a tile server
  elsewhere would also need a CSP change.
- Without a key, the points still draw, on a blank background.

## 6. Lenspack before maps

- The pack dropped coordinates. Lenspack builds dimensions from the dataset's columns with `groupby: true`, and
  in the facilities dataset `latitude`, `longitude`, `zero_dose_children` and `children_enumerated` are
  `groupby: false`. The facility entity in the pack had one dimension (the band) and one measure (a count),
  and nothing told the model there were coordinates. That is why it answered "the data has no coordinates".
- A `deck_scatter` chart became a placeholder (`lenspack has no deck_scatter chart`).
- The existing `rows` query (`entity`, `columns`, `limit`, `orderBy`, `filters`) was the right base: it reads
  through `/api/v1/chart/data` in raw mode. Its columns had to be dimensions, which lat/lon are not.

## 7. What Lenspack does with this: point maps

- **Pack:** an entity may have `geo: {lat, lon}` naming its coordinate columns. It is detected from columns
  named `latitude`/`longitude` (or `lat`/`lon`/`lng`) and can be set in the deployment yaml. The catalogue
  text tells the model which entities have locations.
- **Query:** a new `points` query: `entity`, an optional category `color` (a dimension), an optional `size`
  (a measure, aggregated per point, as Superset does), an optional `label` (a dimension, for tooltips),
  `filters`, and a `limit` (default 1000, at most 5000). Each row comes back as
  `{lat, lon, color?, size?, label?}`, with `truncated` when the limit was hit. The same `/query` endpoint
  serves it, so the renderer and the model both get coordinates.
- **Widget:** `chart: "map"`, with points queries only.
- **Standalone renderer:** points plotted in Web Mercator, fitted to their extent, with a category legend,
  size by square root, tooltips, and light and dark themes. A basemap is **off by default**, so no tile
  server is used unless a deployment sets an XYZ raster tile URL and its attribution. Pointing a demo at
  tile.openstreetmap.org would break OSM's usage policy, so we don't.
- **Superset, both ways:**
  - widget → `deck_scatter`: `spatial` latlong from the entity's `geo`; `point_radius_fixed` fixed or the
    size measure's metric; `dimension` set to the colour column; `mapbox_style` from config (Light by
    default); `autozoom`; `row_limit`; filters.
  - `deck_scatter` → widget only when every key maps (`latlong` on the entity's `geo` columns, no time grain,
    no `js_*` code, no `delimited`/`geohash`); otherwise it stays a placeholder that names the reason.
    Round-trip tested.
- **Spatial questions** are answered from the coordinates and the place columns only. "North-east" means
  relative to the points' own extent, and the answer says so. No geography is invented.
