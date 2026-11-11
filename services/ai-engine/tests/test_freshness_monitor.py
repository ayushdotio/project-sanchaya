import unittest
from datetime import datetime, timedelta, timezone

from app.services.freshness_monitor import (
    evaluate_finding_freshness,
    get_latest_project_activity,
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
        self.bulk_write_calls = 0

    def find(self, filters, projection=None):
        matched = [
            r
            for r in self.records
            if all(r.get(k) == v for k, v in (filters or {}).items())
        ]
        return FakeCursor(matched)

    def update_one(self, query, update):
        for record in self.records:
            if record["_id"] == query["_id"]:
                record.update(update["$set"])
                break

    def bulk_write(self, ops, ordered=False):
        self.bulk_write_calls += 1
        for op in ops:
            # Support both pymongo.UpdateOne and simple tuples if needed
            filt = getattr(op, "_filter", None)
            doc = getattr(op, "_doc", None)
            if filt is not None and doc is not None:
                self.update_one(filt, doc)


class TestFreshnessMonitor(unittest.TestCase):

    def test_old_evidence_is_stale(self):
        old_date = (datetime.now(timezone.utc) - timedelta(days=120)).isoformat()
        self.assertTrue(is_evidence_stale(old_date, 90))

    def test_recent_evidence_is_not_stale(self):
        recent_date = datetime.now(timezone.utc).isoformat()
        self.assertFalse(is_evidence_stale(recent_date, 90))

    def test_accepts_datetime_objects(self):
        old_dt = datetime.now() - timedelta(days=120)
        recent_dt = datetime.now(timezone.utc)
        self.assertTrue(is_evidence_stale(old_dt, 90))
        self.assertFalse(is_evidence_stale(recent_dt, 90))

    def test_invalid_timestamp_raises_error(self):
        with self.assertRaises(ValueError):
            is_evidence_stale("not-a-valid-date", 90)

    def test_evaluate_finding_freshness_against_newer_activity(self):
        now = datetime.now(timezone.utc)
        older_note = {
            "source_id": "SRC-DOC-001",
            "created_at": now - timedelta(days=10),
            "updated_at": now - timedelta(days=5),
            "imported_at": now,
        }
        newer_commit = {
            "source_id": "SRC-GH-010",
            "created_at": now - timedelta(days=1),
            "updated_at": now - timedelta(days=1),
            "imported_at": now,
        }
        latest_at = get_latest_project_activity([older_note, newer_commit])

        older_info = evaluate_finding_freshness(older_note, latest_project_activity_at=latest_at)
        self.assertTrue(older_info.recheck_recommended)
        self.assertIn("Newer project activity", older_info.reason or "")

        newer_info = evaluate_finding_freshness(newer_commit, latest_project_activity_at=latest_at)
        self.assertFalse(newer_info.recheck_recommended)
        self.assertIsNone(newer_info.reason)

    def test_database_scan_classifies_evidence(self):
        old_date = (datetime.now(timezone.utc) - timedelta(days=120)).date().isoformat()
        recent_date = datetime.now(timezone.utc).date().isoformat()

        records = [
            {"_id": "old-1", "projectId": "proj-1", "submitted_at": old_date},
            {"_id": "new-1", "projectId": "proj-1", "submitted_at": recent_date},
            {"_id": "bad-1", "projectId": "proj-1", "submitted_at": "invalid-date"},
            {"_id": "other-proj", "projectId": "proj-2", "submitted_at": old_date},
        ]

        collection = FakeCollection(records)
        report = scan_evidence_freshness(collection, 90, project_id="proj-1")

        self.assertEqual(report["scanned"], 3)
        self.assertEqual(report["stale_count"], 1)
        self.assertEqual(report["current_count"], 1)
        self.assertEqual(report["invalid_date_count"], 1)

        self.assertEqual(records[0]["freshness_status"], "stale")
        self.assertEqual(records[1]["freshness_status"], "current")
        self.assertEqual(records[2]["freshness_status"], "invalid_date")
        self.assertNotIn("freshness_status", records[3])

    def test_database_scan_respects_limit(self):
        records = [
            {
                "_id": str(i),
                "submitted_at": datetime.now(timezone.utc).date().isoformat(),
            }
            for i in range(5)
        ]
        collection = FakeCollection(records)
        report = scan_evidence_freshness(collection, 90, limit=2)
        self.assertEqual(report["scanned"], 2)


if __name__ == "__main__":
    unittest.main()
