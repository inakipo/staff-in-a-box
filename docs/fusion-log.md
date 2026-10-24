# How fusion got good (2026-10-24)

Each step was a measured failure, a named cause, and one change. Scoreboard = `bench_fusion.py` (30 seeded report
streams over the baseline plan; "found" = a confirmed track within 2 km of the true Red unit).

| v | change | result | why it failed / worked |
|---|---|---|---|
| 0 | OR-Tools assignment, padded with dummies | 0 confirmed tracks | the solver needs a square problem; with dummies it found no assignment, so every report became a new track |
| 1 | Hungarian algorithm (SciPy), one-to-one per 5-min batch | 3 to 5 tracks per Red unit | one-to-one is the radar assumption (one blip per target per sweep); human reports duplicate by nature |
| 2 | sequential: each report, in the order it was seen, joins its nearest gated track | Red battalion "lost" in most runs | the track kept extrapolating its speed after the column stopped at the bridge: 50 km of phantom travel |
| 3 | coasting: trust speed for 15 min after the last sighting, then hold | 85 % found, 2.2 tracks per unit | a 40-minute gap without sightings: the column reappears outside the gate |
| 4 | re-identification: reachable at road speed, same type, similar size, both tracks with 2+ reports | found dropped to 75 % | the merge averaged positions; a continuation must take the newest position |
| 5 | merge keeps the newest sighting's position and speed | 72 % found, 1.27 tracks per unit at t=200; but 0.4 false tracks per run at t=300 | the gate grew 1 km per 10 min without a cap: after 100 silent minutes it was 12 km wide, so ghost reports confirmed each other |
| 6 | gate capped at 5 km | **72 / 78 % found, 1.17 / 1.25 tracks per unit, 0.97 / 0.94 km error, 0 / 0.07 false tracks per run** (t=200 / t=300) | current |

Remaining misses are mostly units nobody has reported recently (Red recce is never seen in most runs: no Blue
observer near its road). Next candidate: predict along the road network instead of a straight line.
