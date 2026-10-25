#!/usr/bin/env bash
# Road network and rivers for the exercise area from OpenStreetMap (Overpass API). Elevation tiles are in data/dem already.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in roads water; do
  curl -sS -m 300 -A "staff-in-a-box (research)" --data-urlencode "data@data/osm/$f.overpassql" \
    https://overpass.kumi.systems/api/interpreter -o "data/osm/$f.json"
  echo "data/osm/$f.json: $(wc -c < data/osm/$f.json) bytes"
done
