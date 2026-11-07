"""Regression checks for scale, repeatability, and broken data detection."""

import copy
import json
import unittest
from pathlib import Path

from generate import generate
from validate import validate


class ScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.demo = generate("demo", 2026)

    def test_original_fixture_is_preserved(self):
        original = json.loads(Path(__file__).with_name("nationwide-v1.json").read_text())
        self.assertEqual(generate(), original)
        self.assertEqual(validate(original)["households"], 60)

    def test_demo_coverage(self):
        self.assertEqual(validate(self.demo)["households"], 10000)
        hotspots = self.demo["hotspots"]
        self.assertEqual(len({h["state_code"] for h in hotspots}), 50)
        self.assertEqual(sum(h["is_dense_demo"] for h in hotspots), 6)
        self.assertEqual({h["household_count"] for h in hotspots if h["is_dense_demo"]}, {1000})

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
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                damaged = copy.deepcopy(self.demo)
                mutate(damaged)
                with self.assertRaises((ValueError, KeyError)):
                    validate(damaged)


if __name__ == "__main__":
    unittest.main()
