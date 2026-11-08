"""Synthetic impact layers and sourced employee-review recommendation templates.

Geography is authored illustration, never an official forecast or warning.
Context zones remain separate so geographic membership does not imply exposure.
"""

import math

GUIDANCE = {
    "tornado": ("https://www.weather.gov/safety/tornado-prepare", [
        ("shelter_plan", "Review shelter plans", "Confirm households know their designated sturdy shelter and how to receive local warnings."),
        ("accessible_shelter", "Identify shelter access needs", "Record mobility and transport barriers for employee follow-up before severe weather."),
    ]),
    "earthquake": ("https://www.osha.gov/earthquakes/preparedness", [
        ("shake_drill", "Review earthquake readiness", "Share earthquake drill guidance and identify sturdy cover locations before an event."),
        ("secure_items", "Review falling-object hazards", "Encourage a review of unsecured furniture and household emergency supplies."),
    ]),
    "hurricane": ("https://www.weather.gov/safety/hurricane-plan", [
        ("evacuation_plan", "Review official evacuation information", "Confirm the household can access local emergency management evacuation-zone and shelter information."),
        ("transport_plan", "Record evacuation support needs", "Identify transport, supplies, and communication needs for employee review before a storm."),
    ]),
    "wildfire": ("https://www.airnow.gov/wildfires/be-smoke-ready/", [
        ("smoke_plan", "Review cleaner-air options", "Share cleaner-air room and air-quality alert resources for smoke preparedness."),
        ("local_alerts", "Confirm access to local alerts", "Record how households receive local emergency alerts and identify support needs; follow official evacuation instructions."),
    ]),
    "blizzard": ("https://www.weather.gov/safety/winter-before", [
        ("winter_supplies", "Review winter readiness", "Check plans for emergency supplies, communications, and loss of heat or power."),
        ("isolation_check", "Plan isolation follow-up", "Record households needing assistance if winter travel becomes unsafe and plan employee check-ins."),
    ]),
    "flood": ("https://www.weather.gov/safety/flood-before", [
        ("flood_plan", "Review flood preparedness", "Share local alert and evacuation-planning resources; identify access to higher ground."),
        ("flood_access", "Review transport barriers", "Record evacuation assistance needs and remind households to avoid entering floodwater."),
    ]),
}


def shape(x, y, offsets):
    ring = [[round(x+dx, 6), round(y+dy, 6)] for dx, dy in offsets]
    return {"type": "Polygon", "coordinates": [ring+[ring[0]] ]}


def ellipse(x, y, rx, ry):
    return shape(x, y, [(rx*math.cos(i*math.tau/24), ry*math.sin(i*math.tau/24)) for i in range(24)])


def footprints(hazard, x, y):
    """Each tuple gives component, qualitative exercise severity, geometry."""
    if hazard == "tornado":
        return [("damage_corridor", "high", shape(x, y, [(-.09,-.05),(.09,.035),(.08,.055),(-.10,-.03)]))]
    if hazard == "earthquake":
        return [("shaking_outer", "moderate", ellipse(x,y,.10,.08)),
                ("shaking_inner", "high", ellipse(x,y,.045,.035))]
    if hazard == "hurricane":
        return [("wind", "moderate", ellipse(x,y,.105,.08)),
                ("surge", "high", shape(x,y,[(.025,-.075),(.09,-.06),(.095,.055),(.055,.075),(.015,.025)]))]
    if hazard == "wildfire":
        return [("fire_perimeter", "high", shape(x,y,[(-.04,-.035),(.025,-.03),(.04,.005),(.015,.04),(-.035,.025)])),
                ("smoke", "moderate", shape(x,y,[(-.055,-.04),(.07,-.065),(.105,-.01),(.085,.065),(-.02,.05)]))]
    if hazard == "blizzard":
        return [("snow_wind", "moderate", shape(x,y,[(-.105,-.04),(-.06,-.08),(.07,-.07),(.11,.025),(.04,.085),(-.08,.06)])),
                ("isolation", "high", ellipse(x+.01,y+.005,.045,.035))]
    if hazard == "flood":
        return [("inundation", "high", shape(x,y,[(-.10,-.065),(-.055,-.075),(-.005,-.02),(.04,-.035),(.10,.05),(.065,.075),(.015,.025),(-.03,.015)]))]
    raise ValueError(f"Unsupported hazard: {hazard}")


def add_impacts(data, preset, seed):
    data["schema_version"] = 3
    data["scenario_id"] = f"nationwide-{preset}-v3"
    data["generation"] = {"preset": preset, "seed": seed if preset != "small" else None, "generator_version": 3}
    data["impact_layers"] = []
    data["preparedness_recommendations"] = []
    for hazard, (url, templates) in GUIDANCE.items():
        for key, title, detail in templates:
            data["preparedness_recommendations"].append({
                "id": f"{hazard}-{key}", "hazard_type": hazard, "title": title,
                "description": detail, "phase": "preparedness", "requires_human_review": True,
                "guidance_url": url, "guidance_checked_on": "2026-11-07",
                "source_label": "RiskReach employee-review template informed by linked public guidance",
            })
    zones = {z["id"]: z for z in data["zones"]}
    for zone in zones.values():
        zone["boundary_role"] = "geographic_context"
    for disaster in data["disasters"]:
        key, hazard = disaster["id"], disaster["type"]
        region = zones[f"{key}-region"]
        ring = region["boundary"]["coordinates"][0]
        x = (min(p[0] for p in ring)+max(p[0] for p in ring))/2
        y = (min(p[1] for p in ring)+max(p[1] for p in ring))/2
        for component, severity, geometry in footprints(hazard,x,y):
            data["impact_layers"].append({
                "id": f"{key}-{component}", "disaster_id": key, "context_zone_id": region["id"],
                "hazard_type": hazard, "component": component, "severity": severity,
                "severity_basis": "Qualitative exercise assumption; not an official intensity measurement",
                "geometry": geometry, "data_kind": "simulation", "is_simulated": True,
                "source": data["source"], "updated_at": data["reference_time"],
                "label": f"SIMULATION: {disaster['name']} / {component.replace('_',' ')}",
                "limitations": "Authored footprint; no terrain, coastline, hydrology, wind, or seismic model. Not an official warning, forecast, or evacuation boundary.",
                "recommendation_ids": [f"{hazard}-{t[0]}" for t in GUIDANCE[hazard][1]],
            })
    return data
