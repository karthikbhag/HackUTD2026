"""Print the deterministic baseline fixture; no network or random data."""

import json
import argparse
import copy
import random
from datetime import datetime, timedelta
from pathlib import Path
from impacts import add_impacts

NOW = "2026-11-07T12:00:00Z"
SOURCE = "RiskReach authored synthetic fixture; no live forecasts or observations"
HOTSPOTS = [
    ("tornado", "Central Oklahoma", -97.52, 35.47, "shelter_support"),
    ("earthquake", "Southern California", -118.24, 34.05, "welfare_check"),
    ("hurricane", "Gulf Coast Florida", -82.46, 27.95, "evacuation_assistance"),
    ("wildfire", "Northern California", -122.70, 38.44, "smoke_support"),
    ("blizzard", "Upper Midwest", -93.27, 44.98, "winter_weather_support"),
    ("flood", "Southeast Texas", -95.37, 29.76, "evacuation_assistance"),
]


def polygon(x, y, dx, dy):
    ring = [[x-dx, y-dy], [x+dx, y-dy], [x+dx, y+dy], [x-dx, y+dy], [x-dx, y-dy]]
    return {"type": "Polygon", "coordinates": [[[round(n, 6) for n in p] for p in ring]]}


def generate_small():
    data = {
        "scenario_id": "nationwide-v1", "schema_version": 1,
        "name": "Fictional nationwide multi-hazard exercise", "is_simulated": True,
        "reference_time": NOW, "source": SOURCE,
        "national_context": {"name": "United States overview", "bounds": [-180, 18, -65, 72],
                             "purpose": "Map framing only; not a nationwide impact footprint"},
        "selected_hotspot_id": "tornado-neighborhood", "disasters": [], "zones": [],
        "households": [], "response_teams": [], "help_requests": [],
    }
    for hazard, region, x, y, capability in HOTSPOTS:
        data["disasters"].append({
            "id": hazard, "name": f"Simulated {region} {hazard} exercise", "type": hazard,
            "phase": "preparedness", "source": SOURCE, "is_simulated": True, "updated_at": NOW,
        })
        for level, dx, dy, parent in [("region", .4, .3, None), ("neighborhood", .04, .03, f"{hazard}-region")]:
            data["zones"].append({
                "id": f"{hazard}-{level}", "disaster_id": hazard,
                "name": f"{region} fictional {level}", "level": level, "parent_zone_id": parent,
                "boundary": polygon(x, y, dx, dy), "risk_level": "high" if level == "neighborhood" else "moderate",
                "source": SOURCE, "is_simulated": True, "updated_at": NOW,
            })
        for i in range(1, 11):
            inside = i <= 8
            data["households"].append({
                "id": f"{hazard}-household-{i:02}",
                "zone_id": f"{hazard}-" + ("neighborhood" if inside else "region"),
                "display_name": f"Fictional {hazard.title()} Household {i:02}",
                "latitude": round(y + (i-4)*.004 if inside else y+.1, 6),
                "longitude": round(x + (i-4)*.005 if inside else x+.15+(i-9)*.02, 6),
                "is_customer": i % 2 == 1,
                "check_in_status": ["unknown", "urgent", "needs_help", "safe", "unknown", "safe", "needs_help", "unknown", "safe", "unknown"][i-1],
                "vulnerability_flags": ["limited_mobility"] if i in [1, 2] else ["transport_needed"] if i in [3, 7] else [],
                "last_contact_at": None if i in [1, 8, 10] else "2026-11-07T06:00:00Z" if i in [2, 3] else "2026-11-07T11:30:00Z",
            })
        for i in [1, 2]:
            data["response_teams"].append({
                "id": f"{hazard}-team-{i}", "name": f"Fictional {hazard.title()} Team {i}",
                "latitude": round(y+.015*i, 6), "longitude": round(x-.015*i, 6),
                "status": "available" if i == 1 else "unavailable", "capacity": 4,
                "capabilities": [capability, "welfare_check"] if capability != "welfare_check" else ["welfare_check", "supply_delivery"],
            })
        for i, household in [(1, 2), (2, 4)]:
            data["help_requests"].append({
                "id": f"{hazard}-request-{i}", "household_id": f"{hazard}-household-{household:02}",
                "need_type": capability if i == 1 else "supply_delivery",
                "urgency": "urgent" if i == 1 else "moderate", "status": "open",
                "created_at": "2026-11-07T11:00:00Z", "resolved_at": None,
            })
    return data


# Authored approximate anchors for synthetic points, not official state centroids
# or verified land/state boundaries. One context hotspot per state supplements
# the six denser narrative hotspots above.
STATE_ANCHORS = {
    "AL": (-86.8, 32.4), "AK": (-149.9, 61.2), "AZ": (-112.1, 33.4),
    "AR": (-92.3, 34.7), "CA": (-121.5, 38.6), "CO": (-105.0, 39.7),
    "CT": (-72.7, 41.8), "DE": (-75.5, 39.2), "FL": (-81.7, 30.3),
    "GA": (-84.4, 33.8), "HI": (-157.8, 21.3), "ID": (-116.2, 43.6),
    "IL": (-89.7, 39.8), "IN": (-86.2, 39.8), "IA": (-93.6, 41.6),
    "KS": (-95.7, 39.0), "KY": (-84.9, 38.2), "LA": (-91.1, 30.5),
    "ME": (-69.8, 44.3), "MD": (-76.6, 39.0), "MA": (-71.1, 42.4),
    "MI": (-84.6, 42.7), "MN": (-93.1, 45.0), "MS": (-90.2, 32.3),
    "MO": (-92.2, 38.6), "MT": (-112.0, 46.6), "NE": (-96.7, 40.8),
    "NV": (-119.8, 39.2), "NH": (-71.5, 43.2), "NJ": (-74.8, 40.2),
    "NM": (-106.0, 35.7), "NY": (-73.8, 42.7), "NC": (-78.6, 35.8),
    "ND": (-100.8, 46.8), "OH": (-83.0, 40.0), "OK": (-97.5, 35.5),
    "OR": (-123.0, 44.9), "PA": (-76.9, 40.3), "RI": (-71.4, 41.8),
    "SC": (-81.0, 34.0), "SD": (-100.4, 44.4), "TN": (-86.8, 36.2),
    "TX": (-97.7, 30.3), "UT": (-111.9, 40.8), "VT": (-72.6, 44.3),
    "VA": (-77.4, 37.5), "WA": (-122.9, 47.0), "WV": (-81.6, 38.3),
    "WI": (-89.4, 43.1), "WY": (-104.8, 41.1),
}
PRESETS = {"demo": (1000, 80), "stress": (6000, 1280)}
HAZARD_STATES = {
    "earthquake": {"AK", "HI"},
    "wildfire": {"AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"},
    "hurricane": {"AL", "FL", "LA", "MS", "NC", "SC", "TX", "VA"},
    "blizzard": {"CT", "ME", "MA", "MI", "MN", "NH", "NY", "ND", "RI", "SD", "VT", "WI"},
    "tornado": {"AR", "IL", "IN", "IA", "KS", "MO", "NE", "OK", "TN"},
}


def generate_base(preset="small", seed=2026):
    if preset == "small":
        return generate_small()  # Preserve the original fixture exactly.
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset: {preset}")
    dense_count, context_count = PRESETS[preset]
    templates = generate_small()
    data = {k: copy.deepcopy(v) for k, v in templates.items()}
    data.update(scenario_id=f"nationwide-{preset}-v2", schema_version=2)
    data["generation"] = {"preset": preset, "seed": seed, "generator_version": 2}
    for key in ("disasters", "zones", "households", "response_teams", "help_requests"):
        data[key] = []
    data["hotspots"] = []
    dense_states = ["OK", "CA", "FL", "CA", "MN", "TX"]
    specs = [(h, h, region, state, x, y, dense_count, True)
             for (h, region, x, y, _), state in zip(HOTSPOTS, dense_states)]
    for state, (x, y) in STATE_ANCHORS.items():
        hazard = next((h for h, states in HAZARD_STATES.items() if state in states), "flood")
        specs.append((f"state-{state.lower()}", hazard, f"{state} synthetic context", state, x, y, context_count, False))
    for key, hazard, region, state, x, y, count, dense in specs:
        rng = random.Random(f"v2:{seed}:{key}")
        template = next(d for d in templates["disasters"] if d["type"] == hazard)
        disaster = dict(template, id=key, name=f"Simulated {region} {hazard} exercise")
        data["disasters"].append(disaster)
        for level, dx, dy in [("region", .12, .10), ("neighborhood", .04, .03)]:
            data["zones"].append({
                "id": f"{key}-{level}", "disaster_id": key, "name": f"{region} fictional {level}",
                "level": level, "parent_zone_id": f"{key}-region" if level == "neighborhood" else None,
                "boundary": polygon(x, y, dx, dy), "risk_level": "high" if level == "neighborhood" else "moderate",
                "source": SOURCE, "is_simulated": True, "updated_at": NOW,
            })
        request_count = 0
        for i in range(1, count+1):
            pattern = (i-1) % 10
            base = templates["households"][pattern]
            inside = pattern < 8
            row = copy.deepcopy(base)
            row.update(id=f"{key}-household-{i:06}", zone_id=f"{key}-"+("neighborhood" if inside else "region"),
                       display_name=f"Fictional {region} Household {i:06}",
                       longitude=round(x+rng.uniform(-.035, .035) if inside else x+rng.uniform(.06, .10), 6),
                       latitude=round(y+rng.uniform(-.025, .025) if inside else y+rng.uniform(-.08, .08), 6))
            # Retain known narrative cases, vary later contacts and resource needs.
            if i > 10:
                row["is_customer"] = rng.random() < .6
                row["last_contact_at"] = None if rng.random() < .25 else (
                    datetime.fromisoformat(NOW)-timedelta(minutes=rng.randint(5, 1440))
                ).isoformat().replace("+00:00", "Z")
                row["vulnerability_flags"] = rng.choice([[], ["limited_mobility"], ["transport_needed"]])
            data["households"].append(row)
            if pattern in (1, 3):
                request_count += 1
                need = next(h[4] for h in HOTSPOTS if h[0] == hazard) if pattern == 1 else "supply_delivery"
                data["help_requests"].append({
                    "id": f"{key}-request-{request_count:06}", "household_id": row["id"],
                    "need_type": need, "urgency": "urgent" if pattern == 1 else "moderate",
                    "status": "open", "created_at": "2026-11-07T11:00:00Z", "resolved_at": None,
                })
        team_count = max(2, count//50)
        capability = next(h[4] for h in HOTSPOTS if h[0] == hazard)
        for i in range(1, team_count+1):
            data["response_teams"].append({
                "id": f"{key}-team-{i:04}", "zone_id": f"{key}-region",
                "name": f"Fictional {region} Team {i}",
                "latitude": round(y+rng.uniform(-.08, .08), 6), "longitude": round(x+rng.uniform(-.10, .10), 6),
                "status": "unavailable" if i % 5 == 0 or i == 2 else "available",
                "capacity": rng.randint(2, 8), "capabilities": sorted({capability, "welfare_check", "supply_delivery"} if i % 2 else {"welfare_check"}),
            })
        data["hotspots"].append({
            "id": key, "state_code": state, "disaster_id": key, "zone_id": f"{key}-neighborhood",
            "is_dense_demo": dense, "household_count": count, "request_count": request_count,
            "team_count": team_count,
        })
    return data


def generate(preset="small", seed=2026):
    return add_impacts(generate_base(preset, seed), preset, seed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", choices=["small", "demo", "stress"], default="small")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--output", type=Path, help="Write UTF-8 JSON directly; otherwise print JSON")
    args = parser.parse_args()
    encoded = json.dumps(generate(args.preset, args.seed), indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
        print(f"Wrote {args.output} ({len(encoded.encode('utf-8')):,} bytes)")
    else:
        print(encoded, end="")
