// Sets up Superset the way a person would in its UI: a database, datasets with saved
// metrics and descriptions, and a dashboard built from ordinary Superset charts.
// Safe to run again: databases and datasets are updated, each dashboard is made once.
//
//   docker compose run --rm setup
//
// Two independent parts, each run when its settings are there:
//   - Sample (Postgres): DATA_SQLALCHEMY_URI points at the sample tables from sample-data/.
//     Three datasets and "HCM campaign overview" (one heatmap on purpose: Lenspack keeps it as Superset's).
//   - HCM analytics (ClickHouse): CLICKHOUSE_USER and CLICKHOUSE_PASSWORD (plus CLICKHOUSE_HOST, _PORT,
//     _DATABASE). Virtual datasets over eGov's analytics marts for one tenant (CLICKHOUSE_TENANT, default
//     ng), boundary codes turned into names, and "SMC field test (ClickHouse)".
// Always: SUPERSET_URL, SUPERSET_ADMIN_PASSWORD.

import { supersetClient } from "/app/packages/superset/src/client.ts";

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
const client = supersetClient({ url: env("SUPERSET_URL"), username: "admin", password: env("SUPERSET_ADMIN_PASSWORD") });

type Metric = { metric_name: string; verbose_name: string; expression: string; description?: string; d3format?: string };

// --- HCM analytics on ClickHouse: eGov's marts (analytics.dm_*), one tenant, boundary names joined in.
const TENANT = (process.env.CLICKHOUSE_TENANT ?? "ng").replace(/[^A-Za-z0-9_.-]/g, "");
const tenantSql = (sql: string) => sql.replaceAll("'ng'", `'${TENANT}'`);
const BOUNDARY: Record<string, [string, string]> = {
  state: ["State", "Boundary level 2 of the campaign's hierarchy (the state)"],
  lga: ["LGA", "Boundary level 3: local government area, under state"],
  ward: ["Ward", "Boundary level 4: ward, under LGA"],
  health_facility: ["Health facility", "Boundary level 5: catchment health facility, under ward"],
  settlement: ["Settlement", "Boundary level 6: settlement, under health facility"],
  campaign_number: ["Campaign", "Campaign number"],
};
type Dataset = { table: string; schema: string; sql?: string; time?: string; description: string; columns: Record<string, [string, string]>; metrics: Metric[] };
const CLICKHOUSE: Dataset[] = [
  {
    table: "ch_smc_doses",
    schema: "analytics",
    time: "event_date",
    // The mart keeps distinct children as an AggregateFunction state, which Superset's ClickHouse driver cannot
    // read when it inspects a dataset: the SQL passes it on as String and the metric casts it back to merge it.
    sql: `WITH names AS (SELECT code, any(value) AS name FROM analytics.boundary_hierarchy_localization_dim WHERE tenant_id = 'ng' GROUP BY code)
SELECT s.campaign_number AS campaign_number, s.event_date AS event_date, n2.name AS state, n3.name AS lga, n4.name AS ward, n5.name AS health_facility, n6.name AS settlement,
  s.administration_status AS administration_status, s.delivered_to AS delivered_to, s.is_delivered AS is_delivered,
  s.gender AS gender, s.cycle_index AS cycle_index, s.product_name AS product_name,
  s.administered_count AS administered_count, s.task_rows AS task_rows, s.resource_quantity_sum AS resource_quantity_sum,
  CAST(s.administered_uniq, 'String') AS administered_uniq_state
FROM analytics.dm_smc_administered_base AS s
LEFT JOIN names AS n2 ON n2.code = s.level_two_code
LEFT JOIN names AS n3 ON n3.code = s.level_three_code
LEFT JOIN names AS n4 ON n4.code = s.level_four_code
LEFT JOIN names AS n5 ON n5.code = s.level_five_code
LEFT JOIN names AS n6 ON n6.code = s.level_six_code
WHERE s.tenant_id = 'ng'`,
    description: "SMC drug administration from eGov's analytics mart dm_smc_administered_base: one row per day, boundary, outcome, gender, cycle and product, with the counts already summed.",
    columns: {
      ...BOUNDARY,
      administration_status: ["Outcome", "Administration status recorded on the task"],
      delivered_to: ["Delivered to", "Who the dose was delivered to"],
      is_delivered: ["Delivered", "Whether the dose was delivered"],
      gender: ["Gender", "Gender of the child"],
      cycle_index: ["Cycle", "Campaign cycle number"],
      product_name: ["Product", "Product variant administered"],
    },
    metrics: [
      { metric_name: "doses_administered", verbose_name: "Doses administered", expression: "sum(administered_count)", description: "Administrations recorded, whatever the outcome." },
      { metric_name: "doses_delivered", verbose_name: "Doses delivered", expression: "sumIf(administered_count, is_delivered)", description: "Administrations where the dose was delivered." },
      { metric_name: "children_reached", verbose_name: "Children reached", expression: "uniqExactMerge(CAST(administered_uniq_state, 'AggregateFunction(uniqExact, String, UInt8, String, String)'))", description: "Distinct children with at least one administration. Does not add up over groups." },
      { metric_name: "units_administered", verbose_name: "Units administered", expression: "sum(resource_quantity_sum)", description: "Product units handed out." },
      { metric_name: "task_records", verbose_name: "Task records", expression: "sum(task_rows)", description: "Task rows behind the administrations." },
    ],
  },
  {
    table: "ch_households",
    schema: "analytics",
    time: "event_date",
    sql: `WITH names AS (SELECT code, any(value) AS name FROM analytics.boundary_hierarchy_localization_dim WHERE tenant_id = 'ng' GROUP BY code)
SELECT s.campaign_number AS campaign_number, s.event_date AS event_date, n2.name AS state, n3.name AS lga, n4.name AS ward, n5.name AS health_facility, n6.name AS settlement, s.member_count AS member_count
FROM analytics.dm_household_registry AS s
LEFT JOIN names AS n2 ON n2.code = s.level_two_code
LEFT JOIN names AS n3 ON n3.code = s.level_three_code
LEFT JOIN names AS n4 ON n4.code = s.level_four_code
LEFT JOIN names AS n5 ON n5.code = s.level_five_code
LEFT JOIN names AS n6 ON n6.code = s.level_six_code
WHERE s.tenant_id = 'ng'`,
    description: "Households registered, from eGov's analytics mart dm_household_registry: one row per household (the household id is left out).",
    columns: { ...BOUNDARY },
    metrics: [
      { metric_name: "households", verbose_name: "Households registered", expression: "count()" },
      { metric_name: "people_registered", verbose_name: "People in registered households", expression: "sum(member_count)" },
      { metric_name: "avg_household_size", verbose_name: "Average household size", expression: "avg(member_count)", d3format: ".2f" },
    ],
  },
  {
    table: "ch_referrals",
    schema: "analytics",
    time: "event_date",
    sql: `WITH names AS (SELECT code, any(value) AS name FROM analytics.boundary_hierarchy_localization_dim WHERE tenant_id = 'ng' GROUP BY code)
SELECT s.campaign_number AS campaign_number, s.event_date AS event_date, n2.name AS state, n3.name AS lga, n4.name AS ward, n5.name AS health_facility, n6.name AS settlement,
  s.referred_children_count AS referred_children_count, s.hf_referral_records AS hf_referral_records
FROM analytics.dm_referral_summary AS s
LEFT JOIN names AS n2 ON n2.code = s.level_two_code
LEFT JOIN names AS n3 ON n3.code = s.level_three_code
LEFT JOIN names AS n4 ON n4.code = s.level_four_code
LEFT JOIN names AS n5 ON n5.code = s.level_five_code
LEFT JOIN names AS n6 ON n6.code = s.level_six_code
WHERE s.tenant_id = 'ng'`,
    description: "Referrals to health facilities, from eGov's analytics mart dm_referral_summary: one row per day and boundary.",
    columns: { ...BOUNDARY },
    metrics: [
      { metric_name: "referred_children", verbose_name: "Children referred", expression: "sum(referred_children_count)" },
      { metric_name: "hf_referral_records", verbose_name: "Health facility referral records", expression: "sum(hf_referral_records)" },
    ],
  },
  {
    table: "ch_stock",
    schema: "analytics",
    sql: `WITH names AS (SELECT code, any(value) AS name FROM analytics.boundary_hierarchy_localization_dim WHERE tenant_id = 'ng' GROUP BY code)
SELECT s.campaign_number AS campaign_number, n2.name AS state, n3.name AS lga, n4.name AS ward, n5.name AS health_facility, n6.name AS settlement, s.product_name AS product_name, s.facility_name AS facility_name,
  s.facility_type AS facility_type, s.event_type AS event_type, s.reason AS reason,
  s.quantity_sum AS quantity_sum, s.transaction_count AS transaction_count
FROM analytics.dm_stock_transactions AS s
LEFT JOIN names AS n2 ON n2.code = s.level_two_code
LEFT JOIN names AS n3 ON n3.code = s.level_three_code
LEFT JOIN names AS n4 ON n4.code = s.level_four_code
LEFT JOIN names AS n5 ON n5.code = s.level_five_code
LEFT JOIN names AS n6 ON n6.code = s.level_six_code
WHERE s.tenant_id = 'ng'`,
    description: "Stock movements, from eGov's analytics mart dm_stock_transactions: totals per facility, product, movement type and reason. No dates.",
    columns: {
      ...BOUNDARY,
      product_name: ["Product", "Product variant"],
      facility_name: ["Facility", "Recording facility"],
      facility_type: ["Facility type", "Type of the recording facility"],
      event_type: ["Movement", "Type of stock movement"],
      reason: ["Reason", "Why the stock moved"],
    },
    metrics: [
      { metric_name: "stock_units", verbose_name: "Stock units moved", expression: "sum(quantity_sum)" },
      { metric_name: "stock_transactions", verbose_name: "Stock transactions", expression: "sum(transaction_count)" },
    ],
  },
];


const SAMPLE: Omit<Dataset, "schema">[] = [
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

async function ensureDatabase(name: string, uri: string): Promise<number> {
  const dbs = await client.get<{ result: { id: number }[] }>(`/api/v1/database/${q(`(filters:!((col:database_name,opr:eq,value:'${name}')))`)}`);
  const id = dbs.result[0]?.id;
  if (id) {
    await client.put(`/api/v1/database/${id}`, { sqlalchemy_uri: uri, expose_in_sqllab: true });
    return id;
  }
  return (await client.post<{ id: number }>("/api/v1/database/", { database_name: name, sqlalchemy_uri: uri, expose_in_sqllab: true })).id;
}

/** A physical dataset (a table) or a virtual one (sql), with column labels and saved metrics. */
async function ensureDataset(dbId: number, d: Dataset): Promise<number> {
  const found = await client.get<{ result: { id: number }[] }>(`/api/v1/dataset/${q(`(filters:!((col:table_name,opr:eq,value:${d.table})))`)}`);
  let id = found.result[0]?.id;
  if (!id) id = (await client.post<{ id: number }>("/api/v1/dataset/", { database: dbId, schema: d.schema, table_name: d.table, ...(d.sql ? { sql: d.sql } : {}) })).id;
  else if (d.sql) await client.put(`/api/v1/dataset/${id}`, { sql: d.sql });
  await client.put(`/api/v1/dataset/${id}/refresh`, {});
  const cur = (await client.get<{ result: any }>(`/api/v1/dataset/${id}`)).result;
  const time = d.time ?? null;
  const columns = cur.columns.map((c: any) => {
    const [verbose, desc] = d.columns[c.column_name] ?? [];
    return { id: c.id, column_name: c.column_name, type: c.type, is_dttm: c.column_name === time, groupby: c.column_name in d.columns, filterable: c.column_name in d.columns || c.column_name === time, verbose_name: verbose ?? c.verbose_name, description: desc ?? c.description, expression: c.expression };
  });
  const metrics = d.metrics.map((m) => ({ ...(cur.metrics.find((x: any) => x.metric_name === m.metric_name)?.id ? { id: cur.metrics.find((x: any) => x.metric_name === m.metric_name).id } : {}), ...m }));
  await client.put(`/api/v1/dataset/${id}?override_columns=false`, { description: d.description, main_dttm_col: time, columns, metrics });
  console.log("dataset", d.table, id);
  return id;
}

type Placed = { id: number; width: number; height: number };
/** A dashboard made once, from rows of charts. Returns null when it already exists. */
async function makeDashboard(title: string, slug: string, build: (chart: (name: string, viz: string, ds: number, params: Record<string, unknown>, time?: string | null) => Promise<number>) => Promise<Placed[][]>) {
  const existing = await client.get<{ result: { id: number }[] }>(`/api/v1/dashboard/${q(`(filters:!((col:slug,opr:eq,value:${slug})))`)}`);
  if (existing.result[0]) {
    console.log("dashboard exists", slug, existing.result[0].id);
    return null;
  }
  const dash = await client.post<{ id: number }>("/api/v1/dashboard/", { dashboard_title: title, slug, published: true });
  const chart = async (slice_name: string, viz_type: string, ds: number, params: Record<string, unknown>, time: string | null = "created_at") => {
    const all = time ? [{ expressionType: "SIMPLE", subject: time, operator: "TEMPORAL_RANGE", comparator: "No filter", clause: "WHERE" }] : [];
    return (await client.post<{ id: number }>("/api/v1/chart", { slice_name, viz_type, datasource_id: ds, datasource_type: "table", dashboards: [dash.id], params: JSON.stringify({ datasource: `${ds}__table`, viz_type, adhoc_filters: all, time_range: "No filter", ...params }) })).id;
  };
  const rows = await build(chart);
  const position: Record<string, unknown> = {
    DASHBOARD_VERSION_KEY: "v2",
    ROOT_ID: { type: "ROOT", id: "ROOT_ID", children: ["GRID_ID"] },
    GRID_ID: { type: "GRID", id: "GRID_ID", children: rows.map((_, i) => `ROW-${i + 1}`), parents: ["ROOT_ID"] },
    HEADER_ID: { id: "HEADER_ID", type: "HEADER", meta: { text: title } },
  };
  rows.forEach((row, i) => {
    const rid = `ROW-${i + 1}`;
    position[rid] = { type: "ROW", id: rid, children: row.map((c) => `CHART-${c.id}`), parents: ["ROOT_ID", "GRID_ID"], meta: { background: "BACKGROUND_TRANSPARENT" } };
    for (const c of row) position[`CHART-${c.id}`] = { type: "CHART", id: `CHART-${c.id}`, children: [], parents: ["ROOT_ID", "GRID_ID", rid], meta: { chartId: c.id, width: c.width, height: c.height } };
  });
  await client.put(`/api/v1/dashboard/${dash.id}`, { position_json: JSON.stringify(position), json_metadata: JSON.stringify({ positions: position, color_scheme: "supersetColors" }) });
  console.log("dashboard", slug, dash.id);
  return dash.id;
}

async function sample(uri: string) {
  const dbId = await ensureDatabase("HCM (masked)", uri);
  console.log("database", dbId);
  const ids: Record<string, number> = {};
  for (const d of SAMPLE) ids[d.table] = await ensureDataset(dbId, { ...d, schema: "public", time: "created_at" });
  const task = ids.hcm_task!;
  const hh = ids.hcm_household!;
  await makeDashboard("HCM campaign overview", "hcm-overview", async (chart) => {
    const kpi1 = await chart("Task records", "big_number_total", task, { metric: "count", y_axis_format: "SMART_NUMBER" });
    const kpi2 = await chart("Doses delivered", "big_number_total", task, { metric: "doses_delivered", y_axis_format: "SMART_NUMBER" });
    const kpi3 = await chart("Delivery rate", "big_number_total", task, { metric: "delivery_rate", y_axis_format: ".1%" });
    const line = await chart("Tasks per week", "echarts_timeseries_line", task, { x_axis: "created_at", time_grain_sqla: "P1W", metrics: ["count"], groupby: [], row_limit: 10000, show_legend: true });
    const pie = await chart("Households by state", "pie", hh, { groupby: ["state"], metric: "count", row_limit: 10, sort_by_metric: true, show_legend: true, show_labels: true, label_type: "key_percent" });
    const bar = await chart("Doses delivered by LGA", "echarts_timeseries_bar", task, { x_axis: "lga", metrics: ["doses_delivered"], groupby: [], row_limit: 12, x_axis_sort: "doses_delivered", x_axis_sort_asc: false, show_legend: false });
    const heat = await chart("Outcome by state (heatmap)", "heatmap_v2", task, { x_axis: "state", groupby: "status", metric: "count", row_limit: 1000, normalize_across: "heatmap", linear_color_scheme: "blue_white_yellow", show_values: true });
    return [
      [{ id: kpi1, width: 4, height: 25 }, { id: kpi2, width: 4, height: 25 }, { id: kpi3, width: 4, height: 25 }],
      [{ id: line, width: 8, height: 50 }, { id: pie, width: 4, height: 50 }],
      [{ id: bar, width: 6, height: 50 }, { id: heat, width: 6, height: 50 }],
    ];
  });
}

async function clickhouse() {
  const host = process.env.CLICKHOUSE_HOST || "clickhouse-tunnel";
  const port = process.env.CLICKHOUSE_PORT || "8123";
  const database = process.env.CLICKHOUSE_DATABASE || "analytics";
  const uri = `clickhousedb://${encodeURIComponent(env("CLICKHOUSE_USER"))}:${encodeURIComponent(env("CLICKHOUSE_PASSWORD"))}@${host}:${port}/${database}`;
  const dbId = await ensureDatabase("HCM analytics (ClickHouse)", uri);
  console.log("database (ClickHouse)", dbId);
  const ids: Record<string, number> = {};
  for (const d of CLICKHOUSE) ids[d.table] = await ensureDataset(dbId, { ...d, sql: d.sql ? tenantSql(d.sql) : undefined });
  const smc = ids.ch_smc_doses!;
  const hh = ids.ch_households!;
  const stock = ids.ch_stock!;
  await makeDashboard("SMC field test (ClickHouse)", "ch-smc", async (chart) => {
    const t = "event_date";
    const kpi1 = await chart("Doses administered", "big_number_total", smc, { metric: "doses_administered", y_axis_format: "SMART_NUMBER" }, t);
    const kpi2 = await chart("Children reached", "big_number_total", smc, { metric: "children_reached", y_axis_format: "SMART_NUMBER" }, t);
    const kpi3 = await chart("Households registered", "big_number_total", hh, { metric: "households", y_axis_format: "SMART_NUMBER" }, t);
    const line = await chart("Doses administered per day", "echarts_timeseries_line", smc, { x_axis: t, time_grain_sqla: "P1D", metrics: ["doses_administered"], groupby: [], row_limit: 10000, show_legend: true }, t);
    const bar = await chart("Doses administered by LGA", "echarts_timeseries_bar", smc, { x_axis: "lga", metrics: ["doses_administered"], groupby: [], row_limit: 20, x_axis_sort: "doses_administered", x_axis_sort_asc: false, show_legend: false }, t);
    const hhBar = await chart("Households by LGA", "echarts_timeseries_bar", hh, { x_axis: "lga", metrics: ["households"], groupby: [], row_limit: 20, x_axis_sort: "households", x_axis_sort_asc: false, show_legend: false }, t);
    const table = await chart("Stock by facility type and movement", "table", stock, { query_mode: "aggregate", groupby: ["facility_type", "event_type", "product_name"], metrics: ["stock_units", "stock_transactions"], row_limit: 100, order_desc: true }, null);
    return [
      [{ id: kpi1, width: 4, height: 25 }, { id: kpi2, width: 4, height: 25 }, { id: kpi3, width: 4, height: 25 }],
      [{ id: line, width: 12, height: 50 }],
      [{ id: bar, width: 6, height: 50 }, { id: hhBar, width: 6, height: 50 }],
      [{ id: table, width: 12, height: 50 }],
    ];
  });
}

async function main() {
  const dataUri = process.env.DATA_SQLALCHEMY_URI ?? "";
  const withClickHouse = !!process.env.CLICKHOUSE_PASSWORD;
  if (dataUri.startsWith("postgresql")) await sample(dataUri);
  else if (dataUri) console.log("DATA_SQLALCHEMY_URI is not Postgres: the sample part is skipped (its metrics are Postgres SQL)");
  if (withClickHouse) await clickhouse();
  if (!dataUri.startsWith("postgresql") && !withClickHouse) throw new Error("Nothing to set up: set DATA_SQLALCHEMY_URI (sample) or CLICKHOUSE_USER + CLICKHOUSE_PASSWORD");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
