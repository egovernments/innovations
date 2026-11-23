# Questions

The current suite (`suite/suite-post-v2.yaml`, generated from `suite/suite.yaml` by `make_post_suite.py v2`), with each question's truth on the synthetic data. Truth values come from `truth/truth-post-v2.json`; the SQL behind each is in the suite file. `alt` lists the other accepted definitions (accepted only when the reply says which it used).

Tags: `ambiguous` = more than one defensible answer (see [DEFINITIONS.md](DEFINITIONS.md)); T8 `why` = the reason the right reply is "can't": engine (Lenspack can't express it), pack (config gap), data (the data can't answer it), scope (outside this deployment).

## T1. Totals (8)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T1.1 | How many households were registered? | answer |  | 23,961 |
| T1.2 | How many child visits were recorded in total? | answer |  | 50,000 · alt: excluding closed-household visits (no child seen) 48,250 |
| T1.3 | How many vials were issued to the teams? | answer |  | 1,545 |
| T1.4 | How many zero-dose children were found? | answer |  | 5,701 |
| T1.5 | How many health facilities are covered by the campaign? | answer |  | 100 |
| T1.6 | How many children were vaccinated? | answer | ambiguous | 47,798 · alt: outcome VACCINATED only (no revisits) 47,585 |
| T1.7 | How many people live in the registered households? | answer |  | 121,720 |
| T1.8 | How many children were referred to a health facility? | answer |  | 61 |

## T2. Filtered and grouped (11)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T2.1 | Break down the child visits by outcome. | answer |  | ABSENT 138; REFUSED 314; REVISIT 213; CLOSED_HOUSEHOLD 1,750 … · alt: SMC mart administration status ADMINISTRATION_SUCCESS 47,585; CLOSED_HOUSEHOLD 1,750; VISITED 213; ADMINISTRATION_FAILED 452 |
| T2.2 | How many children were vaccinated in Kalgo? | answer | ambiguous | 11,347 · alt: outcome VACCINATED only 11,299 |
| T2.3 | How many vaccinated children were girls and how many were boys? | answer |  | MALE 23,829; FEMALE 23,969 |
| T2.4 | Households registered in each LGA. | answer |  | Kalgo 5,661; Gwandu 8,753; Birnin Kebbi 9,547 |
| T2.5 | How are the child visits split by age band? | answer |  | 0-11 months 11,612; 12-23 months 9,794; 24-59 months 28,594 · alt: excluding closed households (recorded with age 0) 0-11 months 9,862; 12-23 months 9,794; 24-59 months 28,594 |
| T2.6 | Zero-dose children in each LGA. | answer |  | Kalgo 1,253; Gwandu 2,106; Birnin Kebbi 2,342 |
| T2.7 | Which 5 wards in Birnin Kebbi vaccinated the most children? | answer |  | Kardi 3,773, Gulumbe 2,699, GwadonGwaji 2,282, Gawasu Damana 2,046, Makera 1,808 |
| T2.8 | How many visits found the household closed? | answer |  | 1,750 |
| E8 | Which field worker vaccinated the most children? | answer (pre-rebase: decline) | post-rebase | USR-318022 1,592 · alt: outcome VACCINATED only USR-318022 1,588 |
| E10 | What are the top reasons caregivers refused? | answer (pre-rebase: decline) | post-rebase | RELIGIOUS_CULTURAL 79, NO_FELT_NEED 65, CHILD_SICK 39, VACCINE_NOT_SAFE 37, NO_CAREGIVER_CONSENT 25 … |
| E11 | How many visits were in insecure or inaccessible settlements? | answer (pre-rebase: decline) | post-rebase, ambiguous | 2,908 · alt: inaccessible plus harder to reach 12,564 |

## T3. Time series (6)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T3.1 | Show children vaccinated per day as a line chart. | edit | ambiguous | 2026-10-12 6,277; 2026-10-13 7,249; 2026-10-14 7,261; 2026-10-15 7,087 … · alt: outcome VACCINATED only 2026-10-12 6,250; 2026-10-13 7,223; 2026-10-14 7,227; 2026-10-15 7,060 … |
| T3.2 | Which campaign day had the most vaccinations, and how many? | answer | ambiguous | 2026-10-14 7,261 · alt: outcome VACCINATED only 2026-10-14 7,227 |
| T3.3 | How many households were registered each day? | answer |  | 2026-10-12 3,117; 2026-10-13 3,606; 2026-10-14 3,637; 2026-10-15 3,576 … |
| T3.4 | Plot cumulative children vaccinated against the plan, as a share of target, by day. | edit |  | 2026-10-12 12.31%; 2026-10-13 26.53%; 2026-10-14 40.78%; 2026-10-15 54.68% … |
| T3.5 | Child visits per day in Gwandu. | answer |  | 2026-10-12 2,431; 2026-10-13 2,784; 2026-10-14 2,779; 2026-10-15 2,677 … |
| T3.6 | How many children were vaccinated in the last 30 days? | decline | why: data | The data ends 18 Oct 2026 and the eval clock is 22 Nov, so the window is empty. A good reply says so and offers the campaign's dates (or gives the campaign tota |

## T4. Ratios and coverage against targets (8)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T4.1 | What is our overall coverage against the children target? | answer | ambiguous | 93.77% · alt: outcome VACCINATED only 93.35% |
| T4.2 | Children coverage by LGA. | answer | trap | Kalgo 94.00%; Gwandu 93.60%; Birnin Kebbi 93.78% |
| T4.3 | What share of enumerated children are zero-dose? | answer |  | 11.82% |
| T4.4 | How are we doing on household registration against the household target? | answer |  | 96.99% |
| T4.5 | What is the vial wastage rate? | answer | ambiguous | 14.87% · alt: doses over opened vials returned (second author) 14.42%; spoilt vials over issued (second author's primary) 0.39% |
| T4.6 | What share of issued vials came back spoilt? | answer |  | 0.39% |
| T4.7 | What is children coverage in Gwandu? | answer |  | 93.60% |
| T4.8 | Household registration coverage by LGA. | answer |  | Kalgo 97.08%; Gwandu 96.86%; Birnin Kebbi 97.05% |

## T5. Ranking, thresholds, multi-step (8)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T5.1 | Which wards are below 90% children coverage? | answer | trap | Ambursa, Masama, Nassarawa I |
| T5.2 | Which wards in Gwandu are below 90% coverage? | answer | trap | Masama |
| T5.3 | Which 5 health facilities have the lowest children coverage? | answer |  | Birnin Kebbi Godiya Hospital 76.72%, Ruggad Dawa Health Post 78.57%, Yole Birni Primary Health Centre 78.81%, Gumbai Primary Health Centre 84.57%, Sandare Primary Health Centre 84.65% |
| T5.4 | Which LGA has the highest share of zero-dose children? | answer | ambiguous | Birnin Kebbi 12.17% · alt: zero-dose per child visit Birnin Kebbi 11.75%; share of all zero-dose children Birnin Kebbi 41.08% |
| T5.5 | How many wards are above 95% children coverage? | answer | ambiguous | 8 · alt: outcome VACCINATED only 6 |
| T5.6 | Compare Birnin Kebbi and Kalgo on children coverage and zero-dose share. | answer | ambiguous | Kalgo …; Birnin Kebbi … · alt: zero-dose per child visit Kalgo …; Birnin Kebbi …; share of all zero-dose children Kalgo …; Birnin Kebbi … |
| T5.7 | Which settlement has the lowest children coverage? | answer | ambiguous | Yalango 72.50% · alt: outcome VACCINATED only Tungar Jatau 72.45% |
| T5.8 | What share of all vaccinations happened in Birnin Kebbi? | answer |  | 39.87% |

## T6. Cross-entity and multi-step (5)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T6.1 | For each LGA, give children coverage, zero-dose share and households registered. | answer | ambiguous | Kalgo …; Gwandu …; Birnin Kebbi … · alt: zero-dose per child visit Kalgo …; Gwandu …; Birnin Kebbi …; share of all zero-dose children Kalgo …; Gwandu …; Birnin Kebbi … |
| T6.2 | Show children referred and zero-dose children side by side for each LGA. | answer |  | Kalgo …; Gwandu …; Birnin Kebbi … |
| T6.3 | On average, how many children were vaccinated per vial issued? | answer |  | 30.94 |
| T6.4 | In Kalgo, list households registered and zero-dose children for each health facility. | answer |  | Biri Health Post …; Galaru Health Clinic …; Ubandawaki Clinic …; Mandinka Health Post … … |
| T6.5 | Which wards had fewer than 100 vaccinations on any single day? | answer | multi-step | Ambursa, Kambaza, Kukah, Muntubari, Nassarawa I, Zauro, Zuguru |

## T7. Dashboard edits (14)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T7.1 | Add a bar chart of children coverage by ward, lowest first. | edit |  | Nassarawa I 80.34%, Ambursa 87.73%, Masama 89.59% |
| T7.2 | Add a row of three KPI tiles across the top: children vaccinated, children coverage %, and zero-dose children. | edit |  | board diff |
| T7.3 | Add a bar chart of zero-dose children by age band. | edit |  | 0-11 months 2,820; 12-23 months 1,173; 24-59 months 1,708 |
| T7.4 | Add a filter on LGA that applies to every chart. | edit |  | board diff |
| T7.5 | Rename the board to "Kebbi eval board". | edit |  | board diff |
| T7.6 | Remove the spoilt vials tile. | edit |  | board diff |
| T7.7 | Add a table of households registered and people in them by health facility, for Kalgo only. | edit |  | board diff |
| T7.8 | Add a pie chart of child visits by outcome. | edit |  | ABSENT 138; REFUSED 314; REVISIT 213; CLOSED_HOUSEHOLD 1,750 … |
| T7.9 | Change the vaccinated children gender pie into a bar chart. | edit |  | board diff |
| T7.10 | Add a bar chart of children vaccinated by LGA. / Make that by ward instead. | edit |  | board diff |
| T7.11 | Add a line chart of households registered per day. | edit |  | board diff |
| T7.12 | On the health facility map, colour the points by zero-dose share. | decline | why: engine | The map is a Superset deck.gl chart Lenspack keeps as Superset's; it can't edit it (and has no map kind). |
| T7.13 | Move the ward coverage bar chart up next to the LGA coverage bar chart. | edit |  | board diff |
| T7.14 | वार्ड वाला बार ग्राफ भी ऊपर LGA वाले बार ग्राफ के साथ रख दो ना | edit | hindi | board diff |

## T8. Expected fails: the right reply says it can't, or degrades openly (10)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| E1 | What is coverage for children 3–11 months versus 12–59 months? | decline | why: data | Targets have no age split. Good reply gives vaccinated by age band and says there is no denominator per band. |
| E2 | Show the running total of children vaccinated for each LGA, day by day. | decline | why: engine | Windowed series per group (backlog |
| E4 | How does this campaign compare with the Chad campaign? | decline | why: scope |  |
| E5 | How many children completed all three cycles? | decline | why: data | There is one cycle in this field test. Saying so is the right answer. |
| E6 | How does this week compare with last week? | decline | why: data | Nothing after 18 Oct 2026; the eval clock is 22 Nov, so this week and last week are both empty. A good reply says there is no data in either week and points to  |
| E7 | What is the average time between registering a household and vaccinating its children? | decline | why: engine |  |
| E9 | What share of refusals were converted to vaccinations on a revisit? | decline | why: engine |  |
| E12 | What is coverage for each vaccination team? | decline | why: pack | No team target, and team isn't exposed. |
| E13 | Show doses administered and households registered side by side, broken down by outcome. | decline | why: engine | Households have no outcome; a cross-entity breakdown by a one-sided dimension has returned []. Good reply says households can't be split by outcome. |
| E14 | What is the average household size for female-headed households? | decline | why: data | No head-of-household gender in the household mart. |

## T9. Definitions: questions that hang on a definition, on purpose (9)

| # | Question | Expect | Tags | Truth |
|---|---|---|---|---|
| T9.1 | How many vaccinations have been given? | answer | ambiguous, definitions | 47,798 · alt: visits with outcome VACCINATED (no revisits) 47,585 |
| T9.2 | How much vaccine are we wasting? | answer | ambiguous, definitions | 14.87% · alt: doses over opened vials returned 14.42%; spoilt vials over issued 0.39% |
| T9.3 | What proportion of children are zero-dose? | answer | ambiguous, definitions | 11.82% · alt: zero-dose per child visit 11.40% |
| T9.4 | Which wards stayed below 100 vaccinations a day? | answer | ambiguous, definitions, multi-step | Ambursa, Kambaza, Muntubari, Nassarawa I · alt: daily average below 100 Ambursa, Kambaza, Muntubari, Nassarawa I, Zuguru; below 100 on at least one day Ambursa, Kambaza, Kukah, Muntubari, Nassarawa I, Zauro, Zuguru |
| T9.5 | How many field workers were there? | answer | ambiguous, definitions | 45 |
| T9.6 | How many children did we reach? | answer | ambiguous, definitions | 48,251 · alt: child visits 50,000; children vaccinated 47,798 |
| T9.7 | Which LGA is doing best? | answer | ambiguous, definitions | Kalgo · alt: most children vaccinated Birnin Kebbi |
| T9.8 | How many child visits were in hard-to-reach settlements? | answer | ambiguous, definitions | 3,333 · alt: access class Harder to reach 9,656; access class not Accessible 12,564 |
| T9.9 | What is the average coverage across settlements? | answer | ambiguous, definitions | 93.77% · alt: mean of settlement percentages 94.20% |
