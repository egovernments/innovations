// Sets up Superset the way a person would in its UI: the HCM database, three
// datasets with saved metrics and descriptions, and one dashboard built from
// ordinary Superset charts (one of them a heatmap, which Lenspack cannot edit).
// Safe to run again: the database and datasets are updated, the dashboard is made once.
//
//   docker compose run --rm setup
//
// Environment: SUPERSET_URL, SUPERSET_ADMIN_PASSWORD, DATA_SQLALCHEMY_URI (the data as Superset
// connects to it). The metrics below are Postgres SQL, for the sample tables in sample-data/.
// ClickHouse tables get their own datasets and metrics with the HCM ClickHouse pack.

import { supersetClient } from "/app/packages/superset/src/client.ts";

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const DATA_URI = env("DATA_SQLALCHEMY_URI");
if (!DATA_URI.startsWith("postgresql")) throw new Error("setup.mts defines Postgres metrics for the sample tables; point DATA_SQLALCHEMY_URI at them");
const client = supersetClient({ url: env("SUPERSET_URL"), username: "admin", password: env("SUPERSET_ADMIN_PASSWORD") });

type Metric = { metric_name: string; verbose_name: string; expression: string; description?: string; d3format?: string };
const DATASETS: { table: string; description: string; columns: Record<string, [string, string]>; metrics: Metric[] }[] = [
  {
    table: "hcm_task",
    description: "One row per task a field worker recorded at a household visit (delivery, referral, ineligible), Nigeria SMC/MR-DN campaigns, May 2025 to April 2026.",
    columns: {
      state: ["State", "Nigerian state of the visit (boundary hierarchy, top level)"],
      lga: ["LGA", "Local government area, under state"],
      ward: ["Ward", "Ward, under LGA"],
      health_facility: ["Health facility", "Catchment health facility, under ward"],
      community: ["Community", "Settlement, under health facility"],
      project_type: ["Campaign type", "MR-DN (malaria drug distribution) or LLIN (bed nets)"],
      cycle: ["Cycle", "Campaign cycle number, as text: 01, 02, …"],
      dose: ["Dose", "Dose number within the cycle"],
      delivery_strategy: ["Delivery strategy", "DIRECT or INDIRECT"],
      product: ["Product", "Product variant handed out (e.g. SPAQ 1, SPAQ 2)"],
      status: ["Outcome", "DELIVERED, ADMINISTRATION_SUCCESS, BENEFICIARY_INELIGIBLE, BENEFICIARY_REFERRED, VISITED"],
      ineligible_reason: ["Ineligible reason", "Why a child was found ineligible"],
      role: ["Worker role", "Role of the worker who recorded the task"],
      field_worker: ["Field worker", "Masked user name of the worker"],
      gender: ["Gender", "Gender of the child"],
    },
    metrics: [
      { metric_name: "count", verbose_name: "Task records", expression: "COUNT(*)", description: "Every task recorded, whatever its outcome." },
      { metric_name: "doses_delivered", verbose_name: "Doses delivered", expression: "COUNT(*) FILTER (WHERE is_delivered)", description: "Tasks where the dose was delivered." },
      { metric_name: "units_delivered", verbose_name: "Units delivered", expression: "SUM(quantity) FILTER (WHERE is_delivered)", description: "Product units handed out in delivered tasks." },
      { metric_name: "found_ineligible", verbose_name: "Found ineligible", expression: "COUNT(*) FILTER (WHERE status = 'BENEFICIARY_INELIGIBLE')" },
      { metric_name: "referred", verbose_name: "Referred", expression: "COUNT(*) FILTER (WHERE status = 'BENEFICIARY_REFERRED')", description: "Children referred to a health facility." },
      { metric_name: "delivery_rate", verbose_name: "Delivery rate", expression: "COUNT(*) FILTER (WHERE is_delivered)::float / NULLIF(COUNT(*), 0)", d3format: ".1%", description: "Delivered tasks over all tasks. A ratio: it does not add up over groups." },
      { metric_name: "active_workers", verbose_name: "Active field workers", expression: "COUNT(DISTINCT field_worker)", description: "Distinct workers who recorded at least one task." },
    ],
  },
  {
    table: "hcm_household",
    description: "One row per household registered during the campaigns, March to September 2025.",
    columns: {
      state: ["State", "Nigerian state"],
      lga: ["LGA", "Local government area"],
      ward: ["Ward", "Ward"],
      health_facility: ["Health facility", "Catchment health facility"],
      community: ["Community", "Settlement"],
      cycle: ["Cycle", "Campaign cycle"],
      role: ["Worker role", "Role of the registering worker"],
      field_worker: ["Field worker", "Masked user name of the registering worker"],
    },
    metrics: [
      { metric_name: "count", verbose_name: "Households registered", expression: "COUNT(*)" },
      { metric_name: "people_registered", verbose_name: "People in registered households", expression: "SUM(member_count)" },
      { metric_name: "avg_household_size", verbose_name: "Average household size", expression: "AVG(member_count)", d3format: ".2f" },
    ],
  },
  {
    table: "hcm_stock",
    description: "One row per stock movement recorded at a facility or warehouse, May to November 2025.",
    columns: {
      product: ["Product", "Product variant"],
      event_type: ["Movement", "RECEIVED or DISPATCHED"],
      facility_type: ["Facility type", "Type of the recording facility"],
      facility: ["Facility", "Recording facility"],
      counterparty_type: ["Counterparty type", "Type of the facility on the other side"],
      reason: ["Reason", "Why the stock moved"],
    },
    metrics: [
      { metric_name: "count", verbose_name: "Stock movements", expression: "COUNT(*)" },
      { metric_name: "units_received", verbose_name: "Units received", expression: "SUM(physical_count) FILTER (WHERE event_type = 'RECEIVED' AND physical_count <= 1000000)", description: "Counts above a million are data-entry errors and are left out." },
      { metric_name: "units_dispatched", verbose_name: "Units dispatched", expression: "SUM(physical_count) FILTER (WHERE event_type = 'DISPATCHED' AND physical_count <= 1000000)" },
    ],
  },
];

const q = (o: string) => `?q=${encodeURIComponent(o)}`;

async function main() {
  // Database.
  const dbs = await client.get<{ result: { id: number; database_name: string }[] }>(`/api/v1/database/${q("(filters:!((col:database_name,opr:eq,value:'HCM (masked)')))")}`);
  let dbId = dbs.result[0]?.id;
  if (!dbId) {
    const made = await client.post<{ id: number }>("/api/v1/database/", { database_name: "HCM (masked)", sqlalchemy_uri: DATA_URI, expose_in_sqllab: true });
    dbId = made.id;
  }
  console.log("database", dbId);

  const ids: Record<string, number> = {};
  for (const d of DATASETS) {
    const found = await client.get<{ result: { id: number }[] }>(`/api/v1/dataset/${q(`(filters:!((col:table_name,opr:eq,value:${d.table})))`)}`);
    let id = found.result[0]?.id;
    if (!id) id = (await client.post<{ id: number }>("/api/v1/dataset/", { database: dbId, schema: "public", table_name: d.table })).id;
    const cur = (await client.get<{ result: any }>(`/api/v1/dataset/${id}`)).result;
    const columns = cur.columns.map((c: any) => {
      const [verbose, desc] = d.columns[c.column_name] ?? [];
      return { id: c.id, column_name: c.column_name, type: c.type, is_dttm: c.is_dttm || c.column_name === "created_at", groupby: c.column_name in d.columns, filterable: true, verbose_name: verbose ?? c.verbose_name, description: desc ?? c.description, expression: c.expression };
    });
    const metrics = d.metrics.map((m) => ({ ...(cur.metrics.find((x: any) => x.metric_name === m.metric_name)?.id ? { id: cur.metrics.find((x: any) => x.metric_name === m.metric_name).id } : {}), ...m }));
    await client.put(`/api/v1/dataset/${id}?override_columns=false`, { description: d.description, main_dttm_col: "created_at", columns, metrics });
    ids[d.table] = id;
    console.log("dataset", d.table, id);
  }

  const existing = await client.get<{ result: { id: number }[] }>(`/api/v1/dashboard/${q("(filters:!((col:slug,opr:eq,value:hcm-overview)))")}`);
  if (existing.result[0]) {
    console.log("dashboard exists", existing.result[0].id, JSON.stringify(ids));
    return;
  }
  const dash = await client.post<{ id: number }>("/api/v1/dashboard/", { dashboard_title: "HCM campaign overview", slug: "hcm-overview", published: true });
  const task = ids.hcm_task!;
  const hh = ids.hcm_household!;
  const all = { expressionType: "SIMPLE", subject: "created_at", operator: "TEMPORAL_RANGE", comparator: "No filter", clause: "WHERE" };
  const chart = async (slice_name: string, viz_type: string, ds: number, params: Record<string, unknown>) =>
    (await client.post<{ id: number }>("/api/v1/chart", { slice_name, viz_type, datasource_id: ds, datasource_type: "table", dashboards: [dash.id], params: JSON.stringify({ datasource: `${ds}__table`, viz_type, adhoc_filters: [all], time_range: "No filter", ...params }) })).id;
  const kpi1 = await chart("Task records", "big_number_total", task, { metric: "count", y_axis_format: "SMART_NUMBER" });
  const kpi2 = await chart("Doses delivered", "big_number_total", task, { metric: "doses_delivered", y_axis_format: "SMART_NUMBER" });
  const kpi3 = await chart("Delivery rate", "big_number_total", task, { metric: "delivery_rate", y_axis_format: ".1%" });
  const line = await chart("Tasks per week", "echarts_timeseries_line", task, { x_axis: "created_at", time_grain_sqla: "P1W", metrics: ["count"], groupby: [], row_limit: 10000, show_legend: true });
  const pie = await chart("Households by state", "pie", hh, { groupby: ["state"], metric: "count", row_limit: 10, sort_by_metric: true, show_legend: true, show_labels: true, label_type: "key_percent" });
  const bar = await chart("Doses delivered by LGA", "echarts_timeseries_bar", task, { x_axis: "lga", metrics: ["doses_delivered"], groupby: [], row_limit: 12, x_axis_sort: "doses_delivered", x_axis_sort_asc: false, show_legend: false });
  const heat = await chart("Outcome by state (heatmap)", "heatmap_v2", task, { x_axis: "state", groupby: "status", metric: "count", row_limit: 1000, normalize_across: "heatmap", linear_color_scheme: "blue_white_yellow", show_values: true });
  const C = (id: number, width: number, height: number, row: string) => ({ type: "CHART", id: `CHART-${id}`, children: [], parents: ["ROOT_ID", "GRID_ID", row], meta: { chartId: id, width, height } });
  const R = (id: string, children: string[]) => ({ type: "ROW", id, children, parents: ["ROOT_ID", "GRID_ID"], meta: { background: "BACKGROUND_TRANSPARENT" } });
  const position: Record<string, unknown> = {
    DASHBOARD_VERSION_KEY: "v2",
    ROOT_ID: { type: "ROOT", id: "ROOT_ID", children: ["GRID_ID"] },
    GRID_ID: { type: "GRID", id: "GRID_ID", children: ["ROW-1", "ROW-2", "ROW-3"], parents: ["ROOT_ID"] },
    HEADER_ID: { id: "HEADER_ID", type: "HEADER", meta: { text: "HCM campaign overview" } },
    "ROW-1": R("ROW-1", [`CHART-${kpi1}`, `CHART-${kpi2}`, `CHART-${kpi3}`]),
    "ROW-2": R("ROW-2", [`CHART-${line}`, `CHART-${pie}`]),
    "ROW-3": R("ROW-3", [`CHART-${bar}`, `CHART-${heat}`]),
    [`CHART-${kpi1}`]: C(kpi1, 4, 25, "ROW-1"),
    [`CHART-${kpi2}`]: C(kpi2, 4, 25, "ROW-1"),
    [`CHART-${kpi3}`]: C(kpi3, 4, 25, "ROW-1"),
    [`CHART-${line}`]: C(line, 8, 50, "ROW-2"),
    [`CHART-${pie}`]: C(pie, 4, 50, "ROW-2"),
    [`CHART-${bar}`]: C(bar, 6, 50, "ROW-3"),
    [`CHART-${heat}`]: C(heat, 6, 50, "ROW-3"),
  };
  await client.put(`/api/v1/dashboard/${dash.id}`, { position_json: JSON.stringify(position), json_metadata: JSON.stringify({ positions: position, color_scheme: "supersetColors" }) });
  console.log("dashboard", dash.id, JSON.stringify(ids));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
