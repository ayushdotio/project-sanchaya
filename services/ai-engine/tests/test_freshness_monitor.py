import unittest
from datetime import datetime, timezone, timedelta

from app.services.freshness_monitor import is_evidence_stale


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


if __name__ == "__main__":
    unittest.main()
