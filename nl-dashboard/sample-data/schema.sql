DROP TABLE IF EXISTS hcm_task, hcm_household, hcm_stock;
CREATE TABLE hcm_task (created_at timestamp, state text, lga text, ward text, health_facility text, community text, project_type text, cycle text, dose text,
  delivery_strategy text, product text, status text, ineligible_reason text, role text, field_worker text, gender text, age_months int, is_delivered boolean, quantity numeric);
CREATE TABLE hcm_household (created_at timestamp, state text, lga text, ward text, health_facility text, community text, cycle text, role text, field_worker text, member_count int);
CREATE TABLE hcm_stock (created_at timestamp, product text, event_type text, facility_type text, facility text, counterparty_type text, reason text, physical_count numeric);
