"""Flattens three HCM Elasticsearch indices into CSV for the sample Postgres tables (schema.sql).
Only campaign fields go across: no individual, household or beneficiary ids, no names, no coordinates.
field_worker is the worker's user name: run this against a masked copy of the indices, or blank that column.

Environment: ES_URL (default http://127.0.0.1:9200), and ES_USER + ES_PASSWORD or ES_API_KEY if the cluster wants them.
Usage: python3 export.py task|household|stock > task.csv"""
import base64, csv, json, os, sys, urllib.request
from datetime import datetime, timezone

ES = os.environ.get("ES_URL", "http://127.0.0.1:9200").rstrip("/")
HEADERS = {"content-type": "application/json"}
if os.environ.get("ES_API_KEY"):
    HEADERS["authorization"] = "ApiKey " + os.environ["ES_API_KEY"]
elif os.environ.get("ES_USER"):
    HEADERS["authorization"] = "Basic " + base64.b64encode(f"{os.environ['ES_USER']}:{os.environ.get('ES_PASSWORD', '')}".encode()).decode()

def post(path, body):
    req = urllib.request.Request(ES + path, data=json.dumps(body).encode(), headers=HEADERS)
    return json.load(urllib.request.urlopen(req))

def get(d, path):
    for k in path.split("."):
        if not isinstance(d, dict): return None
        d = d.get(k)
    return d

def ts(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M:%S") if isinstance(ms, (int, float)) else None

B = "Data.boundaryHierarchy."
TABLES = {
    "task": ("project-task-index-v1", [
        ("created_at", lambda s: ts(get(s, "Data.createdTime"))),
        ("state", B + "state"), ("lga", B + "lga"), ("ward", B + "ward"), ("health_facility", B + "healthFacility"), ("community", B + "community"),
        ("project_type", "Data.projectType"), ("cycle", "Data.additionalDetails.cycleIndex"), ("dose", "Data.additionalDetails.doseIndex"),
        ("delivery_strategy", "Data.additionalDetails.deliveryStrategy"), ("product", "Data.productName"), ("status", "Data.administrationStatus"),
        ("ineligible_reason", lambda s: (lambda v: ",".join(v) if isinstance(v, list) else v)(get(s, "Data.additionalDetails.ineligibleReasons"))),
        ("role", "Data.role"), ("field_worker", "Data.userName"), ("gender", "Data.gender"), ("age_months", "Data.age"),
        ("is_delivered", "Data.isDelivered"), ("quantity", "Data.quantity"),
    ]),
    "household": ("household-index-v1", [
        ("created_at", lambda s: ts(get(s, "Data.household.clientAuditDetails.createdTime"))),
        ("state", B + "state"), ("lga", B + "lga"), ("ward", B + "ward"), ("health_facility", B + "healthFacility"), ("community", B + "community"),
        ("cycle", "Data.additionalDetails.cycleIndex"), ("role", "Data.role"), ("field_worker", "Data.userName"), ("member_count", "Data.household.memberCount"),
    ]),
    "stock": ("stock-index-v1", [
        ("created_at", lambda s: ts(get(s, "Data.createdTime"))),
        ("product", "Data.productName"), ("event_type", "Data.eventType"), ("facility_type", "Data.facilityType"), ("facility", "Data.facilityName"),
        ("counterparty_type", "Data.transactingFacilityType"), ("reason", "Data.reason"), ("physical_count", "Data.physicalCount"),
    ]),
}

index, cols = TABLES[sys.argv[1]]
w = csv.writer(sys.stdout)
w.writerow([c for c, _ in cols])
r = post(f"/{index}/_search?scroll=2m", {"size": 5000, "_source": ["Data"], "sort": ["_doc"]})
while r["hits"]["hits"]:
    for h in r["hits"]["hits"]:
        s = h["_source"]
        w.writerow([(f(s) if callable(f) else get(s, f)) for _, f in cols])
    r = post("/_search/scroll", {"scroll": "2m", "scroll_id": r["_scroll_id"]})
