"""Validate the portable demo fixture without installing dependencies."""

import json
import argparse
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def validate(data):
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    hazards = {"tornado", "earthquake", "hurricane", "wildfire", "blizzard", "flood"}
    version = data["schema_version"]
    require(version in {1, 2}, "Unsupported fixture schema")
    require(data["is_simulated"] is True, "Scenario must be labeled synthetic")
    reference = datetime.fromisoformat(data["reference_time"])
    collections = {}
    for name in ("disasters", "zones", "households", "response_teams", "help_requests"):
        rows = data[name]
        collections[name] = {row["id"]: row for row in rows}
        require(len(collections[name]) == len(rows), f"Duplicate IDs in {name}")
    disasters, zones, households, teams, requests = collections.values()
    require({row["type"] for row in disasters.values()} == hazards, "Missing hazard")
    require(len(disasters) == (6 if version == 1 else 56), "Unexpected exercise count")
    require(data["selected_hotspot_id"] in zones, "Selected hotspot is missing")

    def point(lon, lat):
        require(math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90, "Invalid coordinates")

    def contains(zone, lon, lat):
        # Fixture polygons are axis-aligned rectangles. This validates the data;
        # it is not the application's future general-purpose exposure algorithm.
        ring = zone["boundary"]["coordinates"][0]
        return min(p[0] for p in ring) <= lon <= max(p[0] for p in ring) and min(
            p[1] for p in ring
        ) <= lat <= max(p[1] for p in ring)

    for row in disasters.values():
        require(row["is_simulated"] is True and row["source"], "Missing source label")
        require(row["phase"] == "preparedness", "Unexpected baseline phase")
        require(datetime.fromisoformat(row["updated_at"]) == reference, "Stale baseline")
    for zone in zones.values():
        require(zone["disaster_id"] in disasters, "Dangling disaster reference")
        require(zone["level"] in {"region", "neighborhood"}, "Unknown zone level")
        require(zone["risk_level"] in {"moderate", "high"}, "Unknown severity")
        require(zone["is_simulated"] is True and zone["source"], "Unlabeled geometry")
        require(datetime.fromisoformat(zone["updated_at"]) == reference, "Stale zone")
        geometry = zone["boundary"]
        require(geometry["type"] == "Polygon", "Expected GeoJSON polygon")
        ring = geometry["coordinates"][0]
        require(len(ring) == 5 and ring[0] == ring[-1], "Polygon must close")
        for lon, lat in ring:
            point(lon, lat)
        xs, ys = {p[0] for p in ring}, {p[1] for p in ring}
        require(len(xs) == len(ys) == 2, "Expected nondegenerate rectangle")
        require(len({tuple(p) for p in ring[:-1]}) == 4, "Repeated polygon corner")
        if zone["level"] == "neighborhood":
            parent = zones[zone["parent_zone_id"]]
            require(parent["level"] == "region", "Wrong parent level")
            require(parent["disaster_id"] == zone["disaster_id"], "Cross-hazard parent")
            require(all(contains(parent, *p) for p in ring), "Child outside parent")
        else:
            require(zone["parent_zone_id"] is None, "Unexpected regional parent")
    household_groups = defaultdict(list)
    request_groups = defaultdict(list)
    team_groups = defaultdict(list)
    zone_groups = defaultdict(list)
    for zone in zones.values():
        zone_groups[zone["disaster_id"]].append(zone)
    for household in households.values():
        zone = zones[household["zone_id"]]
        household_groups[zone["disaster_id"]].append(household)
        point(household["longitude"], household["latitude"])
        require(contains(zone, household["longitude"], household["latitude"]), "Household outside assigned zone")
        require(household["display_name"].startswith("Fictional "), "Unlabeled household")
        require(type(household["is_customer"]) is bool, "Invalid customer flag")
        require(household["check_in_status"] in {"unknown", "safe", "needs_help", "urgent"}, "Unknown check-in status")
        require(set(household["vulnerability_flags"]) <= {"limited_mobility", "transport_needed"}, "Unknown vulnerability")
        if household["last_contact_at"]:
            require(datetime.fromisoformat(household["last_contact_at"]) <= reference, "Future contact")
    for team in teams.values():
        point(team["longitude"], team["latitude"])
        require(team["status"] in {"available", "unavailable"}, "Invalid baseline team status")
        require(team["capacity"] > 0 and team["capabilities"], "Invalid team resources")
        if version == 2:
            zone = zones[team["zone_id"]]
            require(zone["level"] == "region", "Team must reference a regional zone")
            require(contains(zone, team["longitude"], team["latitude"]), "Team outside region")
            team_groups[zone["disaster_id"]].append(team)
    supported_capabilities = {capability for team in teams.values() for capability in team["capabilities"]}
    for request in requests.values():
        require(request["household_id"] in households, "Dangling household reference")
        require(request["status"] == "open" and request["resolved_at"] is None, "Invalid baseline request")
        require(request["urgency"] in {"urgent", "moderate"}, "Unknown urgency")
        require(datetime.fromisoformat(request["created_at"]) <= reference, "Future request")
        require(request["need_type"] in supported_capabilities, "Unsupported request capability")
        request_groups[zones[households[request["household_id"]]["zone_id"]]["disaster_id"]].append(request)
    hotspot_by_disaster = {}
    if version == 2:
        expected_states = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split())
        hotspots = data["hotspots"]
        require(len({h["id"] for h in hotspots}) == len(hotspots) == 56, "Duplicate or missing hotspots")
        require({h["state_code"] for h in hotspots} == expected_states, "Missing state coverage")
        context = [h for h in hotspots if not h["is_dense_demo"]]
        require(len(context) == 50 and len({h["state_code"] for h in context}) == 50, "Expected one context hotspot per state")
        require(sum(h["is_dense_demo"] for h in hotspots) == 6, "Missing dense hotspots")
        require(data["generation"]["preset"] in {"demo", "stress"}, "Unknown preset")
        require(type(data["generation"]["seed"]) is int, "Invalid seed")
        require(data["generation"]["generator_version"] == 2, "Unknown generator version")
        require(len(households) == {"demo": 10000, "stress": 100000}[data["generation"]["preset"]], "Incorrect preset size")
        for hotspot in hotspots:
            require(hotspot["disaster_id"] in disasters, "Dangling hotspot disaster")
            require(hotspot["disaster_id"] not in hotspot_by_disaster, "Duplicate disaster hotspot")
            require(zones[hotspot["zone_id"]]["disaster_id"] == hotspot["disaster_id"], "Hotspot zone mismatch")
            hotspot_by_disaster[hotspot["disaster_id"]] = hotspot
    for disaster in disasters.values():
        local_zones = zone_groups[disaster["id"]]
        require(sorted(z["level"] for z in local_zones) == ["neighborhood", "region"], "Missing geography level")
        local_households = household_groups[disaster["id"]]
        expected_count = 10 if version == 1 else hotspot_by_disaster[disaster["id"]]["household_count"]
        require(len(local_households) == expected_count, "Incorrect hotspot household count")
        hotspot = next(z for z in local_zones if z["level"] == "neighborhood")
        require(sum(contains(hotspot, h["longitude"], h["latitude"]) for h in local_households) == expected_count * 4 // 5, "Expected 80% inside neighborhood")
        require({h["is_customer"] for h in local_households} == {True, False}, "Missing community/customer mix")
        local_requests = request_groups[disaster["id"]]
        require(len(local_requests) == expected_count // 5, "Expected 20% request coverage")
        require(any(not households[r["household_id"]]["is_customer"] and r["urgency"] == "urgent" for r in local_requests), "Missing urgent community case")
        require(any(households[r["household_id"]]["check_in_status"] == "safe" for r in local_requests), "Missing safe household with unresolved need")
        if version == 2:
            summary = hotspot_by_disaster[disaster["id"]]
            local_teams = team_groups[disaster["id"]]
            require(len(local_requests) == summary["request_count"], "Incorrect request summary")
            require(len(local_teams) == summary["team_count"] == max(2, expected_count//50), "Incorrect team summary")
            require({t["status"] for t in local_teams} == {"available", "unavailable"}, "Missing team availability mix")
            available_capabilities = {c for t in local_teams if t["status"] == "available" for c in t["capabilities"]}
            require({r["need_type"] for r in local_requests} <= available_capabilities, "No local capable available team")
    if version == 1:
        require(len(teams) == 12, "Expected twelve teams")
    return {name: len(rows) for name, rows in collections.items()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture", nargs="?", type=Path, default=Path(__file__).with_name("nationwide-v1.json"))
    fixture = parser.parse_args().fixture
    counts = validate(json.loads(fixture.read_text(encoding="utf-8-sig")))
    print(f"PASS {fixture.name}: " + ", ".join(f"{n} {k}" for k, n in counts.items()))
