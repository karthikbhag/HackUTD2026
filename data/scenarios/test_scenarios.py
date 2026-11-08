"""Regression checks for scale, repeatability, and broken data detection."""

import copy
import json
import unittest
from pathlib import Path

from generate import generate, generate_small, generate_base
from geometry import validate_polygon, contains_point
from impacts import shape
from validate import validate


class ScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.demo = generate("demo", 2026)

    def test_original_fixture_is_preserved(self):
        original = json.loads(Path(__file__).with_name("nationwide-v1.json").read_text())
        self.assertEqual(generate_small(), original)
        self.assertEqual(validate(original)["households"], 60)
        self.assertEqual(validate(generate())["impact_layers"], 10)
        bundled = Path(__file__).resolve().parents[2] / "backend/src/default-scenario.json"
        self.assertEqual(generate(), json.loads(bundled.read_text()))

    def test_demo_coverage(self):
        self.assertEqual(validate(self.demo)["households"], 10000)
        hotspots = self.demo["hotspots"]
        self.assertEqual(len({h["state_code"] for h in hotspots}), 50)
        self.assertEqual(sum(h["is_dense_demo"] for h in hotspots), 6)
        self.assertEqual({h["household_count"] for h in hotspots if h["is_dense_demo"]}, {1000})

    def test_legacy_v2_and_household_compatibility(self):
        legacy = generate_base("demo", 2026)
        self.assertEqual(validate(legacy)["households"], 10000)
        for key in ("households", "help_requests", "response_teams", "hotspots"):
            self.assertEqual(legacy[key], self.demo[key])

    def test_stress_preset(self):
        counts = validate(generate("stress"))
        self.assertEqual(counts["households"], 100000)
        self.assertEqual(counts["help_requests"], 20000)
        self.assertEqual(counts["response_teams"], 1970)

    def test_repeatability_and_seed_variation(self):
        self.assertEqual(self.demo, generate("demo", 2026))
        other = generate("demo", 19)
        self.assertNotEqual(self.demo["households"][0]["longitude"], other["households"][0]["longitude"])
        self.assertEqual([h["id"] for h in self.demo["households"]], [h["id"] for h in other["households"]])
        validate(other)

    def test_rejects_invalid_preset(self):
        with self.assertRaises(ValueError):
            generate("unknown")

    def test_impact_components_and_nested_shapes(self):
        small = generate()
        self.assertEqual(len(small["preparedness_recommendations"]), 12)
        self.assertEqual(len(small["impact_layers"]), 10)
        quake = [l for l in small["impact_layers"] if l["hazard_type"] == "earthquake"]
        self.assertEqual({l["severity"] for l in quake}, {"moderate", "high"})
        self.assertNotEqual(quake[0]["geometry"], quake[1]["geometry"])
        self.assertTrue(all(contains_point(quake[0]["geometry"], p) for p in quake[1]["geometry"]["coordinates"][0]))
        # Preserve every base household coordinate and ID while adding impacts.
        self.assertEqual(small["households"], generate_small()["households"])
        validate(small)

    def test_polygon_rejects_invalid_geometry(self):
        for offsets in [ [(0,0),(1,1),(0,1),(1,0)], [(0,0),(1,0),(2,0)], [(0,0),(1,0),(1,0),(0,1)] ]:
            with self.subTest(offsets=offsets), self.assertRaises(ValueError):
                validate_polygon(shape(0,0,offsets))
        validate_polygon(shape(0,0,[(0,0),(2,0),(1,1),(2,2),(0,2)]))
        concave = shape(0,0,[(0,0),(2,0),(1,1),(2,2),(0,2)])
        self.assertTrue(contains_point(concave, (.5,1)))
        self.assertTrue(contains_point(concave, (1,1)))
        self.assertFalse(contains_point(concave, (1.8,1)))

    def test_rejects_damaged_fixtures(self):
        mutations = {
            "duplicate household": lambda d: d["households"].append(d["households"][0]),
            "missing state": lambda d: d["hotspots"][6].update(state_code="XX"),
            "incorrect summary": lambda d: d["hotspots"][0].update(household_count=999),
            "dangling request": lambda d: d["help_requests"][0].update(household_id="missing"),
            "invalid coordinates": lambda d: d["households"][0].update(latitude=200),
            "outside assigned zone": lambda d: d["households"][0].update(longitude=0),
            "unlabeled simulation": lambda d: d["zones"][0].update(is_simulated=False),
            "future contact": lambda d: d["households"][0].update(last_contact_at="2030-01-01T00:00:00Z"),
            "wrong team summary": lambda d: d["hotspots"][0].update(team_count=1),
            "lost urgent community case": lambda d: [h.update(is_customer=True) for h in d["households"]],
            "false live layer": lambda d: d["impact_layers"][0].update(data_kind="forecast"),
            "missing component": lambda d: d["impact_layers"].pop(),
            "wrong recommendation": lambda d: d["impact_layers"][0].update(recommendation_ids=["flood-flood_plan", "flood-flood_access"]),
            "missing human review": lambda d: d["preparedness_recommendations"][0].update(requires_human_review=False),
            "open polygon": lambda d: d["impact_layers"][0]["geometry"]["coordinates"][0].pop(),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                damaged = copy.deepcopy(self.demo)
                mutate(damaged)
                with self.assertRaises((ValueError, KeyError)):
                    validate(damaged)


if __name__ == "__main__":
    unittest.main()
