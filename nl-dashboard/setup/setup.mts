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
//     _DATABASE). Virtual datasets over eGov's Superset-ready views (default.su_ni_*) and two analytics marts,
//     and two dashboards: "nOPV2 field test overview (ClickHouse)" (slug ni-smc) and a national view (ni-national).
// Always: SUPERSET_URL, SUPERSET_ADMIN_PASSWORD.

import { supersetClient } from "/app/packages/superset/src/client.ts";

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};
// Any Superset admin account (SUPERSET_ADMIN_USERNAME, default "admin").
const client = supersetClient({ url: env("SUPERSET_URL"), username: process.env.SUPERSET_ADMIN_USERNAME || "admin", password: env("SUPERSET_ADMIN_PASSWORD") });

type Metric = { metric_name: string; verbose_name: string; expression: string; description?: string; d3format?: string };

type Dataset = { table: string; schema: string; sql?: string; time?: string; description: string; columns: Record<string, [string, string]>; metrics: Metric[] };
// --- HCM analytics on ClickHouse, on eGov's own Superset-ready views (default.su_ni_*: names already joined,
// one view per question) plus two analytics marts the views lack (targets, referrals). The su_ni_* views cover
// eGov's ng field-test campaign; CLICKHOUSE_TENANT scopes only the analytics.* parts (targets, referrals).
//
// Rules the datasets follow, so any grouping Superset or Lenspack asks for gives the right number:
//   - every percentage is a saved metric sum(numerator) / sum(denominator), never an average of ratios;
//   - each quantity has one home ("children vaccinated" and "households registered" live on ni_coverage only);
//   - end-of-campaign quantities (targets, zero-dose, enumerated) sit on the last campaign day's row only, so
//     they add up over places; the *_to_date / *_ref columns carry what cumulative progress by day needs.
const TENANT = (process.env.CLICKHOUSE_TENANT ?? "ng").replace(/[^A-Za-z0-9_.-]/g, "");
const tenantSql = (sql: string) => sql.replaceAll("'ng'", `'${TENANT}'`);
const PLACES: Record<string, [string, string]> = {
  state: ["State", "Boundary level 2 of the campaign's hierarchy (the state)"],
  lga: ["LGA", "Boundary level 3: local government area, under state"],
  ward: ["Ward", "Boundary level 4: ward, under LGA"],
  health_facility: ["Health facility", "Boundary level 5: catchment health facility, under ward"],
  settlement: ["Settlement", "Boundary level 6: settlement, under health facility"],
};
const DAY: Record<string, [string, string]> = {
  campaign_day: ["Campaign day", "Day of the campaign, from 1"],
  day_label: ["Day", "Campaign day with its date, e.g. \"Day 1 (date)\""],
};
// nOPV2 comes in 50-dose vials. Wastage % depends on this assumption.
const DOSES_PER_VIAL = 50;
// "Children vaccinated": eGov's coverage view counts distinct children vaccinated, which includes children
// recorded on a revisit; counting visits with outcome VACCINATED gives a smaller number (the revisits). To
// use the visit count instead, ask by visits: ni_visits, measure visits, filter outcome = VACCINATED.
const CHILDREN_VACCINATED = "sum(children_vaccinated)";
// Planned progress: a settlement's daily target times the campaign day, capped at its target.
const TARGETS = `t AS (
  SELECT level_six_code AS code,
    sumIf(target_population, target_type = 'INDIVIDUAL') AS children_target_all,
    sumIf(target_per_day, target_type = 'INDIVIDUAL') AS children_per_day,
    sumIf(target_population, target_type = 'HOUSEHOLD') AS households_target_all,
    sumIf(target_per_day, target_type = 'HOUSEHOLD') AS households_per_day
  FROM analytics.dm_targets_base
  WHERE tenant_id = 'ng' AND node_level = 6
  GROUP BY code)`;
const DAYS = `d AS (SELECT campaign_day, any(event_date) AS event_date FROM default.su_ni_days GROUP BY campaign_day)`;
const pct = (num: string, den: string) => `(${num}) / nullIf(${den}, 0)`;
const CLICKHOUSE: Dataset[] = [
  {
    table: "ni_coverage",
    schema: "default",
    time: "event_date",
    sql: `WITH ${TARGETS},
${DAYS}
SELECT toDateTime(d.event_date) AS event_date, c.campaign_day AS campaign_day, c.day_and_date_label AS day_label,
  c.state AS state, c.lga AS lga, c.ward AS ward, c.health_facility AS health_facility, c.community AS settlement,
  c.children_vaccinated AS children_vaccinated,
  toInt64(c.households_registered) AS households_registered,
  if(c.is_last_day = 1, c.target_children, 0) AS children_target,
  if(c.is_last_day = 1, toInt64(t.households_target_all), 0) AS households_target,
  if(c.is_last_day = 1, c.zero_dose_cumulative, 0) AS zero_dose_children,
  if(c.is_last_day = 1, c.enumerated_cumulative, 0) AS children_enumerated,
  sum(c.children_vaccinated) OVER (PARTITION BY c.settlement_code ORDER BY c.campaign_day) AS children_vaccinated_to_date,
  sum(toInt64(c.households_registered)) OVER (PARTITION BY c.settlement_code ORDER BY c.campaign_day) AS households_registered_to_date,
  c.target_children AS children_target_ref,
  toInt64(t.households_target_all) AS households_target_ref,
  toInt64(least(c.campaign_day * t.children_per_day, c.target_children)) AS children_planned_to_date,
  toInt64(least(c.campaign_day * t.households_per_day, t.households_target_all)) AS households_planned_to_date
FROM default.su_ni_cov AS c
LEFT JOIN t ON t.code = c.settlement_code
LEFT JOIN d ON d.campaign_day = c.campaign_day`,
    description:
      "Campaign coverage from eGov's view su_ni_cov, one row per settlement and campaign day: children vaccinated and households registered each day, against the children and household targets. Targets, zero-dose children and children enumerated are end-of-campaign figures, held on the last day's row, so coverage % is right for any place and for the whole campaign; for progress by day use the cumulative % measures.",
    columns: { ...PLACES, ...DAY },
    metrics: [
      { metric_name: "children_vaccinated", verbose_name: "Children vaccinated", expression: CHILDREN_VACCINATED, description: "Distinct children given nOPV2 (eGov's coverage definition; it includes children recorded on a revisit).", d3format: ",d" },
      { metric_name: "children_target", verbose_name: "Children target", expression: "sum(children_target)", description: "Children the campaign planned to vaccinate (end of campaign).", d3format: ",d" },
      { metric_name: "children_coverage_pct", verbose_name: "Children coverage %", expression: pct(CHILDREN_VACCINATED, "sum(children_target)"), description: "Children vaccinated over the children target, for the whole campaign. A ratio of sums: right for any place.", d3format: ".1%" },
      { metric_name: "households_registered", verbose_name: "Households registered", expression: "sum(households_registered)", description: "Households registered by the teams.", d3format: ",d" },
      { metric_name: "households_target", verbose_name: "Households target", expression: "sum(households_target)", description: "Households the campaign planned to register (end of campaign).", d3format: ",d" },
      { metric_name: "households_coverage_pct", verbose_name: "Households coverage %", expression: pct("sum(households_registered)", "sum(households_target)"), description: "Households registered over the household target, for the whole campaign.", d3format: ".1%" },
      { metric_name: "zero_dose_children", verbose_name: "Zero-dose children", expression: "sum(zero_dose_children)", description: "Children enumerated who had never had a polio dose before this campaign (end of campaign).", d3format: ",d" },
      { metric_name: "children_enumerated", verbose_name: "Children enumerated", expression: "sum(children_enumerated)", description: "Eligible children enumerated in households (end of campaign).", d3format: ",d" },
      { metric_name: "zero_dose_pct", verbose_name: "Zero-dose share %", expression: pct("sum(zero_dose_children)", "sum(children_enumerated)"), description: "Zero-dose children over children enumerated.", d3format: ".1%" },
      { metric_name: "actual_children_cum_pct", verbose_name: "Actual, children (cumulative %)", expression: pct("sum(children_vaccinated_to_date)", "sum(children_target_ref)"), description: "Children vaccinated so far as a share of target. Only meaningful per campaign day: use it in a daily series.", d3format: ".0%" },
      { metric_name: "planned_children_cum_pct", verbose_name: "Planned, children (cumulative %)", expression: pct("sum(children_planned_to_date)", "sum(children_target_ref)"), description: "Planned children so far (daily target times the day, capped at target) as a share of target. Only meaningful per campaign day.", d3format: ".0%" },
      { metric_name: "actual_households_cum_pct", verbose_name: "Actual, households (cumulative %)", expression: pct("sum(households_registered_to_date)", "sum(households_target_ref)"), description: "Households registered so far as a share of target. Only meaningful per campaign day.", d3format: ".0%" },
      { metric_name: "planned_households_cum_pct", verbose_name: "Planned, households (cumulative %)", expression: pct("sum(households_planned_to_date)", "sum(households_target_ref)"), description: "Planned households so far as a share of target. Only meaningful per campaign day.", d3format: ".0%" },
    ],
  },
  {
    table: "ni_status",
    schema: "default",
    sql: `WITH hh AS (
  SELECT level_six_code AS code, sum(target_population) AS hh_target
  FROM analytics.dm_targets_base
  WHERE tenant_id = 'ng' AND node_level = 6 AND target_type = 'HOUSEHOLD'
  GROUP BY code),
s AS (
  SELECT c.state AS state, c.lga AS lga, c.ward AS ward, c.health_facility AS health_facility, c.community AS settlement,
    sum(c.children_vaccinated) AS cv, any(c.target_children) AS ct, toInt64(sum(c.households_registered)) AS hr, toInt64(any(hh.hh_target)) AS ht
  FROM default.su_ni_cov AS c
  LEFT JOIN hh ON hh.code = c.settlement_code
  GROUP BY c.state, c.lga, c.ward, c.health_facility, c.community, c.settlement_code)
SELECT state, lga, ward, health_facility, settlement, x.1 AS grp, x.2 AS status, x.3 AS people
FROM s
ARRAY JOIN [('Children', 'Vaccinated', toInt64(cv)), ('Children', 'Remaining', toInt64(greatest(ct - cv, 0))),
            ('Households', 'Registered', hr), ('Households', 'Remaining', greatest(ht - hr, 0))] AS x`,
    description:
      "Reached vs remaining against target, per settlement (from su_ni_cov and the targets mart), for coverage pies: grp is Children or Households, status is Vaccinated/Registered or Remaining. Filter grp to one of them. Remaining is counted per settlement, so settlements past their target add nothing.",
    columns: { ...PLACES, grp: ["Group", "Children or Households"], status: ["Status", "Vaccinated or Registered (reached) vs Remaining (target not yet reached)"] },
    metrics: [{ metric_name: "people", verbose_name: "Children or households", expression: "sum(people)", description: "Children or households, by group and status: filter grp to one of them.", d3format: ",d" }],
  },
  {
    table: "ni_visits",
    schema: "default",
    time: "task_date",
    sql: `SELECT toDateTime(task_date) AS task_date, campaign_day, state, lga, ward, health_facility, community AS settlement, toString(team) AS team,
  if(toString(gender) = '', 'UNKNOWN', toString(gender)) AS gender, age_band, settlement_type, access_class, outcome,
  if(refusal_reason = '', NULL, refusal_reason) AS refusal_reason, if(absence_reason = '', NULL, absence_reason) AS absence_reason,
  if(is_vaccinated = 1, 'Yes', 'No') AS vaccinated, if(is_zero_dose = 1, 'Yes', 'No') AS zero_dose, if(is_revisit = 1, 'Yes', 'No') AS revisit,
  toUInt32(is_refused) AS is_refused, toUInt32(is_absent) AS is_absent
FROM default.su_ni_task`,
    description:
      "Child visits from eGov's view su_ni_task, one row per visit: outcome, refusal and absence reasons, gender, age band, settlement type, access, team, campaign day, and the place columns (state, LGA, ward, health facility, settlement), so visits can be filtered or grouped by place. No names, ids or GPS points. For counts of vaccinated or zero-dose children by gender or age, count visits with vaccinated = Yes or zero_dose = Yes.",
    columns: {
      ...PLACES,
      campaign_day: DAY.campaign_day!,
      team: ["Team", "Vaccination team (user code)"],
      gender: ["Gender", "Gender of the child (UNKNOWN when not recorded)"],
      age_band: ["Age band", "Age band of the child"],
      settlement_type: ["Settlement type", "Type of settlement (rural, urban, slum, hard to reach, …)"],
      access_class: ["Access", "Whether the settlement was accessible or insecure"],
      outcome: ["Outcome", "Visit outcome: VACCINATED, CLOSED_HOUSEHOLD, REFUSED, REVISIT, ABSENT"],
      refusal_reason: ["Refusal reason", "Why the caregiver refused (refused visits only)"],
      absence_reason: ["Absence reason", "Why the child was not there (absent or closed-household visits only)"],
      vaccinated: ["Vaccinated", "Yes when the child counts as vaccinated (includes revisits recorded as vaccinated)"],
      zero_dose: ["Zero-dose", "Yes when the child had never had a polio dose before this campaign"],
      revisit: ["Revisit", "Yes for a revisit"],
    },
    metrics: [
      { metric_name: "visits", verbose_name: "Child visits", expression: "count()", description: "Visits recorded, whatever the outcome.", d3format: ",d" },
      { metric_name: "refusals", verbose_name: "Refusals", expression: "sum(is_refused)", description: "Visits where the caregiver refused.", d3format: ",d" },
      { metric_name: "refusals_per_1000_visits", verbose_name: "Refusals per 1,000 visits", expression: `1000 * ${pct("sum(is_refused)", "count()")}`, description: "Refusals per 1,000 visits. A ratio of sums.", d3format: ",.1f" },
    ],
  },
  {
    table: "ni_members",
    schema: "default",
    time: "task_date",
    sql: `SELECT toDateTime(task_date) AS task_date, campaign_day, state, lga, ward, health_facility, community AS settlement,
  if(toString(gender) = '', 'UNKNOWN', toString(gender)) AS gender, pyramid_age_band AS member_age_band
FROM default.su_ni_member`,
    description:
      "People in registered households, from eGov's view su_ni_member: one row per household member, with the household's place, the registration day, the member's gender and age band. No names, ids or GPS points.",
    columns: {
      ...PLACES,
      campaign_day: DAY.campaign_day!,
      gender: ["Gender", "Gender (UNKNOWN when not recorded)"],
      member_age_band: ["Member age band", "Age band of the household member, all ages (population-pyramid bands)"],
    },
    metrics: [
      { metric_name: "people_registered", verbose_name: "People in registered households", expression: "count()", description: "Household members registered, one per person, all ages.", d3format: ",d" },
    ],
  },
  {
    table: "ni_missed",
    schema: "default",
    time: "event_date",
    sql: `WITH ${DAYS}
SELECT toDateTime(d.event_date) AS event_date, m.campaign_day AS campaign_day, m.day_and_date_label AS day_label,
  m.state AS state, m.lga AS lga, m.ward AS ward, m.health_facility AS health_facility, m.community AS settlement,
  toInt64(m.missed_on_day) AS missed_on_day, m.outstanding AS outstanding
FROM default.su_ni_missed AS m
LEFT JOIN d ON d.campaign_day = m.campaign_day`,
    description:
      "Missed children from eGov's view su_ni_missed, one row per settlement and campaign day: children missed that day, and children still outstanding at the end of that day.",
    columns: { ...PLACES, ...DAY },
    metrics: [
      { metric_name: "children_missed", verbose_name: "Children missed", expression: "sum(missed_on_day)", description: "Children missed, summed over days.", d3format: ",d" },
      { metric_name: "outstanding_children", verbose_name: "Children outstanding", expression: "sum(outstanding)", description: "Children still to reach at the end of a day. A level, not a flow: show it per campaign day, or filter to the last day for the end of the campaign.", d3format: ",d" },
    ],
  },
  {
    table: "ni_team_stock",
    schema: "default",
    sql: `SELECT toString(team) AS team, state, lga, ward, ifNull(health_facility, '') AS health_facility,
  vials_issued, vials_returned, opened_vials_returned, spoilt_vials_returned,
  vials_returned - opened_vials_returned - spoilt_vials_returned AS vials_returned_unopened,
  stock_balance, toInt64(children_vaccinated) AS team_children_vaccinated, toInt64(active_days) AS active_days
FROM default.su_ni_team_stock`,
    description: `Vaccine stock per team from eGov's view su_ni_team_stock, for the whole campaign: vials issued, returned (opened, spoilt, unopened), balance, and the children the team vaccinated. No dates. Wastage assumes ${DOSES_PER_VIAL} doses per vial.`,
    columns: { team: ["Team", "Vaccination team (user code)"], state: PLACES.state!, lga: PLACES.lga!, ward: PLACES.ward!, health_facility: PLACES.health_facility! },
    metrics: [
      { metric_name: "vials_issued", verbose_name: "Vials issued", expression: "sum(vials_issued)", d3format: ",d" },
      { metric_name: "vials_returned", verbose_name: "Vials returned", expression: "sum(vials_returned)", description: "Vials returned, opened or not.", d3format: ",d" },
      { metric_name: "vials_spoilt", verbose_name: "Vials spoilt", expression: "sum(spoilt_vials_returned)", d3format: ",d" },
      { metric_name: "vials_used", verbose_name: "Vials used", expression: "sum(vials_issued) - sum(vials_returned_unopened)", description: "Vials issued minus vials returned unopened.", d3format: ",d" },
      { metric_name: "vial_wastage_pct", verbose_name: "Vial wastage %", expression: `1 - ${pct("sum(team_children_vaccinated)", `(sum(vials_issued) - sum(vials_returned_unopened)) * ${DOSES_PER_VIAL}`)}`, description: `Doses in used vials not given to a child, assuming ${DOSES_PER_VIAL} doses per vial.`, d3format: ".1%" },
      { metric_name: "spoilt_vials_pct", verbose_name: "Spoilt vials %", expression: pct("sum(spoilt_vials_returned)", "sum(vials_issued)"), description: "Vials returned spoilt, as a share of vials issued.", d3format: ".1%" },
      { metric_name: "vials_per_child", verbose_name: "Vials used per child vaccinated", expression: pct("sum(vials_issued) - sum(vials_returned_unopened)", "sum(team_children_vaccinated)"), description: "Vials used for each child vaccinated (lower is better). The inverse of children per vial.", d3format: ".3f" },
      { metric_name: "children_per_vial", verbose_name: "Children vaccinated per vial used", expression: pct("sum(team_children_vaccinated)", "sum(vials_issued) - sum(vials_returned_unopened)"), description: `Children vaccinated for each vial used (higher is better; at most ${DOSES_PER_VIAL}). The inverse of vials per child.`, d3format: ",.1f" },
      { metric_name: "stock_balance", verbose_name: "Stock balance (vials)", expression: "sum(stock_balance)", d3format: ",d" },
    ],
  },
  {
    table: "ni_facilities",
    schema: "default",
    sql: `SELECT health_facility, state, lga, ward, latitude, longitude, zero_dose_band, zero_dose_children, children_enumerated
FROM default.su_ni_zd_facility`,
    description: "Health facilities from eGov's view su_ni_zd_facility, one row per facility with its location and zero-dose band (quartiles). For zero-dose counts and shares by place, use ni_coverage.",
    columns: { health_facility: PLACES.health_facility!, state: PLACES.state!, lga: PLACES.lga!, ward: PLACES.ward!, zero_dose_band: ["Zero-dose band", "Facility's zero-dose share quartile, 1 (lowest) to 4 (highest)"] },
    metrics: [{ metric_name: "facilities", verbose_name: "Health facilities", expression: "count()", d3format: ",d" }],
  },
  {
    table: "ni_referrals",
    schema: "analytics",
    time: "event_date",
    sql: `WITH names AS (SELECT code, any(value) AS name FROM analytics.boundary_hierarchy_localization_dim WHERE tenant_id = 'ng' GROUP BY code)
SELECT s.event_date AS event_date, n2.name AS state, n3.name AS lga, n4.name AS ward, n5.name AS health_facility, n6.name AS settlement,
  s.referred_children_count AS referred_children_count, s.hf_referral_records AS hf_referral_records
FROM analytics.dm_referral_summary AS s
LEFT JOIN names AS n2 ON n2.code = s.level_two_code
LEFT JOIN names AS n3 ON n3.code = s.level_three_code
LEFT JOIN names AS n4 ON n4.code = s.level_four_code
LEFT JOIN names AS n5 ON n5.code = s.level_five_code
LEFT JOIN names AS n6 ON n6.code = s.level_six_code
WHERE s.tenant_id = 'ng'`,
    description: "Referrals to health facilities, from eGov's analytics mart dm_referral_summary (no su_ni_* view has them): one row per day and boundary.",
    columns: { ...PLACES },
    metrics: [
      { metric_name: "referred_children", verbose_name: "Children referred", expression: "sum(referred_children_count)", d3format: ",d" },
      { metric_name: "hf_referral_records", verbose_name: "Health facility referral records", expression: "sum(hf_referral_records)", d3format: ",d" },
    ],
  },
  {
    table: "ni_freshness",
    schema: "default",
    sql: `SELECT toDateTime(mart_last_day) AS mart_last_day, toDateTime(silver_last_day) AS source_last_day, is_stale
FROM default.su_ni_freshness`,
    description: "How fresh the data is, from eGov's view su_ni_freshness: the last day in the marts and in the source tables, and whether the marts are behind.",
    columns: {},
    metrics: [{ metric_name: "is_stale", verbose_name: "Marts behind the source", expression: "max(is_stale)", description: "1 when the marts are behind the source tables.", d3format: ",d" }],
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
  const cov = ids.ni_coverage!;
  const status = ids.ni_status!;
  const visits = ids.ni_visits!;
  const missed = ids.ni_missed!;
  const stock = ids.ni_team_stock!;
  const fac = ids.ni_facilities!;
  const fresh = ids.ni_freshness!;
  const t = "event_date";
  const range = (col: string) => ({ expressionType: "SIMPLE", subject: col, operator: "TEMPORAL_RANGE", comparator: "No filter", clause: "WHERE" });
  const eq = (subject: string, value: string) => ({ expressionType: "SIMPLE", subject, operator: "==", comparator: value, clause: "WHERE" });
  const pie = { show_legend: false, show_labels: true, label_type: "key_value_percent", labels_outside: true, number_format: ",d", row_limit: 10, sort_by_metric: true };
  const pctBars = { y_axis_format: ".0%", show_legend: true, legendOrientation: "top", row_limit: 50, x_axis_sort_asc: true, xAxisLabelRotation: 45 };

  // The overview: the questions a campaign manager asks first (eGov's recommended set over su_ni_*).
  await makeDashboard("nOPV2 field test overview (ClickHouse)", "ni-smc", async (chart) => {
    const k1 = await chart("Children vaccinated", "big_number_total", cov, { metric: "children_vaccinated", y_axis_format: ",d" }, t);
    const k2 = await chart("Coverage vs target", "big_number_total", cov, { metric: "children_coverage_pct", y_axis_format: ".1%" }, t);
    const k3 = await chart("Households registered", "big_number_total", cov, { metric: "households_registered", y_axis_format: ",d" }, t);
    const k4 = await chart("Zero-dose share", "big_number_total", cov, { metric: "zero_dose_pct", y_axis_format: ".1%" }, t);
    const byLga = await chart("Coverage by LGA", "echarts_timeseries_bar", cov, { ...pctBars, x_axis: "lga", metrics: ["children_coverage_pct"], groupby: [], x_axis_sort: "children_coverage_pct", show_legend: false }, t);
    const daily = await chart("Children vaccinated per day", "echarts_timeseries_bar", cov, { x_axis: t, time_grain_sqla: "P1D", metrics: ["children_vaccinated"], groupby: [], row_limit: 1000, y_axis_format: "SMART_NUMBER", show_legend: false }, t);
    const outcomes = await chart("Visit outcomes", "echarts_timeseries_bar", visits, { x_axis: "outcome", metrics: ["visits"], groupby: [], row_limit: 20, x_axis_sort: "visits", x_axis_sort_asc: false, y_axis_format: "SMART_NUMBER", show_legend: false }, "task_date");
    const refusals = await chart("Why caregivers refused", "echarts_timeseries_bar", visits, { x_axis: "refusal_reason", metrics: ["visits"], groupby: [], row_limit: 20, x_axis_sort: "visits", x_axis_sort_asc: false, y_axis_format: "SMART_NUMBER", show_legend: false, adhoc_filters: [range("task_date"), eq("outcome", "REFUSED")] }, "task_date");
    const outstanding = await chart("Children outstanding by day", "echarts_timeseries_line", missed, { x_axis: t, time_grain_sqla: "P1D", metrics: ["outstanding_children"], groupby: [], row_limit: 1000, y_axis_format: "SMART_NUMBER", markerEnabled: true, show_legend: false }, t);
    const heat = await chart("Children vaccinated, ward by day", "heatmap_v2", cov, { x_axis: "day_label", groupby: "ward", metric: "children_vaccinated", row_limit: 10000, normalize_across: "heatmap", linear_color_scheme: "blue_white_yellow", show_values: true, sort_x_axis: "alpha_asc", sort_y_axis: "alpha_asc" }, t);
    const zd = await chart("Zero-dose children by health facility", "table", cov, { query_mode: "aggregate", groupby: ["health_facility", "ward"], metrics: ["zero_dose_children", "children_enumerated", "zero_dose_pct"], row_limit: 100, order_desc: true, timeseries_limit_metric: "zero_dose_children" }, t);
    const teams = await chart("Vaccine stock by team", "table", stock, { query_mode: "aggregate", groupby: ["team", "lga"], metrics: ["vials_issued", "vials_used", "vials_spoilt", "vials_per_child", "stock_balance"], row_limit: 100, order_desc: true, timeseries_limit_metric: "vials_issued" }, null);
    const freshness = await chart("Data freshness", "table", fresh, { query_mode: "raw", all_columns: ["mart_last_day", "source_last_day", "is_stale"], row_limit: 1 }, null);
    return [
      [{ id: k1, width: 3, height: 25 }, { id: k2, width: 3, height: 25 }, { id: k3, width: 3, height: 25 }, { id: k4, width: 3, height: 25 }],
      [{ id: byLga, width: 4, height: 50 }, { id: daily, width: 8, height: 50 }],
      [{ id: outcomes, width: 6, height: 50 }, { id: refusals, width: 6, height: 50 }],
      [{ id: outstanding, width: 6, height: 50 }, { id: heat, width: 6, height: 50 }],
      [{ id: zd, width: 6, height: 60 }, { id: teams, width: 6, height: 60 }],
      [{ id: freshness, width: 4, height: 20 }],
    ];
  });

  // A national-style view: two paired series (children, households) against target, wastage, places, gender, plan vs actual.
  await makeDashboard("nOPV2 field test: national view (ClickHouse)", "ni-national", async (chart) => {
    const p1 = await chart("Children coverage: vaccinated vs remaining (target)", "pie", status, { ...pie, groupby: ["status"], metric: "people", adhoc_filters: [eq("grp", "Children")] }, null);
    const p2 = await chart("Household coverage: registered vs remaining (target)", "pie", status, { ...pie, groupby: ["status"], metric: "people", adhoc_filters: [eq("grp", "Households")] }, null);
    const k1 = await chart("Children vaccinated", "big_number_total", cov, { metric: "children_vaccinated", y_axis_format: ",d" }, t);
    const k2 = await chart("Households registered", "big_number_total", cov, { metric: "households_registered", y_axis_format: ",d" }, t);
    const k3 = await chart("Vial wastage", "big_number_total", stock, { metric: "vial_wastage_pct", y_axis_format: ".1%", subheader: `${DOSES_PER_VIAL} doses per vial` }, null);
    const k4 = await chart("Spoilt vials", "big_number_total", stock, { metric: "spoilt_vials_pct", y_axis_format: ".1%", subheader: "Share of vials issued" }, null);
    const b1 = await chart("Coverage by LGA (children and households)", "echarts_timeseries_bar", cov, { ...pctBars, x_axis: "lga", metrics: ["children_coverage_pct", "households_coverage_pct"], groupby: [] }, t);
    const b2 = await chart("Coverage by ward (children and households)", "echarts_timeseries_bar", cov, { ...pctBars, x_axis: "ward", metrics: ["children_coverage_pct", "households_coverage_pct"], groupby: [] }, t);
    const map = await chart("Health facilities", "deck_scatter", fac, {
      spatial: { type: "latlong", latCol: "latitude", lonCol: "longitude" },
      row_limit: 5000,
      point_radius_fixed: { type: "fix", value: 1500 },
      point_unit: "square_m",
      min_radius: 4,
      max_radius: 30,
      multiplier: 1,
      color_picker: { r: 31, g: 119, b: 180, a: 1 },
      mapbox_style: "mapbox://styles/mapbox/light-v9",
      autozoom: true,
    }, null);
    const g1 = await chart("Vaccinated children: gender", "pie", visits, { ...pie, groupby: ["gender"], metric: "visits", adhoc_filters: [range("task_date"), eq("vaccinated", "Yes")] }, "task_date");
    const g2 = await chart("Zero-dose children: gender", "pie", visits, { ...pie, groupby: ["gender"], metric: "visits", adhoc_filters: [range("task_date"), eq("zero_dose", "Yes")] }, "task_date");
    const line = await chart("Planned vs actual (cumulative % of target)", "echarts_timeseries_line", cov, {
      x_axis: t,
      time_grain_sqla: "P1D",
      metrics: ["planned_children_cum_pct", "actual_children_cum_pct", "planned_households_cum_pct", "actual_households_cum_pct"],
      groupby: [],
      row_limit: 1000,
      y_axis_format: ".0%",
      markerEnabled: true,
      show_legend: true,
      legendOrientation: "top",
    }, t);
    return [
      [{ id: p1, width: 6, height: 50 }, { id: p2, width: 6, height: 50 }],
      [{ id: k1, width: 3, height: 25 }, { id: k2, width: 3, height: 25 }, { id: k3, width: 3, height: 25 }, { id: k4, width: 3, height: 25 }],
      [{ id: b1, width: 12, height: 50 }],
      [{ id: b2, width: 12, height: 50 }],
      [{ id: map, width: 12, height: 70 }],
      [{ id: g1, width: 6, height: 50 }, { id: g2, width: 6, height: 50 }],
      [{ id: line, width: 12, height: 50 }],
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
