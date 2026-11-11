import unittest
from datetime import datetime, timezone

try:
    import mongomock
    from bson import ObjectId
    from fastapi.testclient import TestClient

    from app.main import app
    from app.store import reset_canonical_database, set_canonical_database

    HAS_INTERNAL_DEPS = True
except ImportError:
    HAS_INTERNAL_DEPS = False


@unittest.skipUnless(HAS_INTERNAL_DEPS, "fastapi/pymongo/mongomock/reportlab not installed locally")
class TestInternalAnalyticsAPI(unittest.TestCase):

    def setUp(self):
        self.mock_client = mongomock.MongoClient()
        self.db = self.mock_client["sanchaya"]
        set_canonical_database(self.db)
        self.client = TestClient(app)

    def tearDown(self):
        reset_canonical_database()

    def test_internal_compute_and_pdf_stream(self):
        pid = ObjectId()
        inc_id = ObjectId()
        now = datetime.now(timezone.utc)

        self.db["users"].insert_one({"_id": inc_id, "name": "Kabir", "email": "kabir@sanchaya.dev"})
        self.db["projects"].insert_one(
            {
                "_id": pid,
                "name": "Campus Events",
                "members": {"leaderId": ObjectId(), "outgoingIds": [], "incomingIds": [inc_id]},
                "readinessChecklist": {},
                "readinessStatus": "Needs Attention",
            }
        )
        self.db["source_records"].insert_one(
            {
                "projectId": pid,
                "source_id": "SRC-DOC-001",
                "source_type": "document",
                "origin": "notes.md",
                "redacted_content": "Decided to use MongoDB.",
                "metadata": {"redactionCount": 0},
                "created_at": now,
                "updated_at": now,
            }
        )
        self.db["findings"].insert_one(
            {
                "_id": ObjectId(),
                "projectId": pid,
                "category": "decision",
                "claim": "Use MongoDB",
                "source_id": "SRC-DOC-001",
                "verbatim_excerpt": "Decided to use MongoDB.",
                "verification_status": "Supported",
                "review_status": "approved",
                "evidence_origin": "system",
            }
        )

        res = self.client.post("/internal/compute-risk-and-readiness", json={"projectId": str(pid)})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["readinessStatus"], "Ready for Review")

        # PDF export denied until Approved for Sharing
        denied_pdf = self.client.get(f"/internal/generate-pdf/{pid}")
        self.assertEqual(denied_pdf.status_code, 403)

        # Mark approved and verify PDF stream
        self.db["projects"].update_one({"_id": pid}, {"$set": {"readinessStatus": "Approved for Sharing"}})
        ok_pdf = self.client.get(f"/internal/generate-pdf/{pid}")
        self.assertEqual(ok_pdf.status_code, 200)
        self.assertEqual(ok_pdf.headers["content-type"], "application/pdf")
        self.assertEqual(ok_pdf.content[:4], b"%PDF")


if __name__ == "__main__":
    unittest.main()

