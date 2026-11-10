
import unittest
from datetime import datetime, timezone, timedelta

from app.services.freshness_monitor import (
    is_evidence_stale,
    scan_evidence_freshness,
)


class FakeCursor:
    def __init__(self, records):
        self.records = records

    def limit(self, count):
        return FakeCursor(self.records[:count])

    def __iter__(self):
        return iter(self.records)


class FakeCollection:
    def __init__(self, records):
        self.records = records

    def find(self, filters, projection):
        return FakeCursor(self.records)

    def update_one(self, query, update):
        for record in self.records:
            if record["_id"] == query["_id"]:
                record.update(update["$set"])
                break


class TestFreshnessMonitor(unittest.TestCase):

    def test_old_evidence_is_stale(self):
        old_date = (
            datetime.now(timezone.utc) - timedelta(days=120)
        ).isoformat()

        self.assertTrue(is_evidence_stale(old_date, 90))

    def test_recent_evidence_is_not_stale(self):
        recent_date = datetime.now(timezone.utc).isoformat()

        self.assertFalse(is_evidence_stale(recent_date, 90))

    def test_invalid_timestamp_raises_error(self):
        with self.assertRaises(ValueError):
            is_evidence_stale("not-a-valid-date", 90)

    def test_database_scan_classifies_evidence(self):
        old_date = (
            datetime.now(timezone.utc) - timedelta(days=120)
        ).date().isoformat()

        recent_date = datetime.now(timezone.utc).date().isoformat()

        records = [
            {"_id": "old-1", "submitted_at": old_date},
            {"_id": "new-1", "submitted_at": recent_date},
            {"_id": "bad-1", "submitted_at": "invalid-date"},
        ]

        collection = FakeCollection(records)

        report = scan_evidence_freshness(collection, 90)

        self.assertEqual(report["scanned"], 3)
        self.assertEqual(report["stale_count"], 1)
        self.assertEqual(report["current_count"], 1)
        self.assertEqual(report["invalid_date_count"], 1)

        self.assertEqual(records[0]["freshness_status"], "stale")
        self.assertEqual(records[1]["freshness_status"], "current")
        self.assertEqual(records[2]["freshness_status"], "invalid_date")

    def test_database_scan_respects_limit(self):
        records = [
            {
                "_id": str(i),
                "submitted_at": datetime.now(timezone.utc).date().isoformat(),
            }
            for i in range(5)
        ]

        collection = FakeCollection(records)

        report = scan_evidence_freshness(
            collection,
            90,
            limit=2
        )

        self.assertEqual(report["scanned"], 2)


if __name__ == "__main__":
    unittest.main()
