import json
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

try:
    import mongomock
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.database import reset_database, set_database
    from app.main import app

    HAS_API_DEPS = True
except ImportError:
    HAS_API_DEPS = False


@unittest.skipUnless(HAS_API_DEPS, "fastapi/pymongo/mongomock not installed in local environment")
class TestAIEngineAPI(unittest.TestCase):

    def setUp(self):
        get_settings.cache_clear()
        self.mock_client = mongomock.MongoClient()
        self.db = self.mock_client["sanchaya"]
        set_database(self.db)
        self.client = TestClient(app)

    def tearDown(self):
        reset_database()
        get_settings.cache_clear()

    def test_health_and_root(self):
        root_res = self.client.get("/")
        self.assertEqual(root_res.status_code, 200)
        self.assertEqual(root_res.json()["status"], "running")

        health_res = self.client.get("/health")
        self.assertEqual(health_res.status_code, 200)
        self.assertEqual(health_res.json()["database"], "sanchaya")

    def test_extract_and_verify_invalid_project_id_returns_422(self):
        res = self.client.post("/internal/extract-and-verify", json={"projectId": "not-an-oid"})
        self.assertEqual(res.status_code, 422)

    def test_extract_and_verify_with_mongomock_and_mock_llm(self):
        from bson import ObjectId

        project_oid = ObjectId()
        now = datetime.now(timezone.utc)
        self.db["source_records"].insert_one(
            {
                "projectId": project_oid,
                "source_id": "SRC-DOC-001",
                "source_type": "document",
                "origin": "Design Doc",
                "raw_filename": "design.md",
                "redacted_content": "Team decided to use MongoDB for canonical persistence.",
                "created_at": now,
                "updated_at": now,
                "imported_at": now,
                "metadata": {},
            }
        )

        def fake_llm(_sys, _usr):
            return json.dumps(
                {
                    "findings": [
                        {
                            "category": "decision",
                            "claim": "Use MongoDB for canonical persistence",
                            "source_id": "SRC-DOC-001",
                            "verbatim_excerpt": "decided to use MongoDB for canonical persistence",
                            "rationale": None,
                            "topic": "database",
                        }
                    ]
                }
            )

        with patch("app.services.ai_extractor.build_openai_callable", return_value=fake_llm):
            res = self.client.post(
                "/internal/extract-and-verify",
                json={"projectId": str(project_oid)},
            )

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["findingsCount"], 1)
        self.assertEqual(body["supportedCount"], 1)
        self.assertEqual(body["gapsGenerated"], 1)  # missing rationale

    def test_internal_token_guard_when_configured(self):
        with patch.dict(os.environ, {"INTERNAL_API_TOKEN": "top-secret-token"}, clear=False):
            get_settings.cache_clear()
            res = self.client.post(
                "/internal/extract-and-verify",
                json={"projectId": "507f1f77bcf86cd799439011"},
            )
            self.assertEqual(res.status_code, 401)

    def test_removed_unauthenticated_self_reported_routes(self):
        self.assertEqual(self.client.get("/api/v1/evidence/self-reported").status_code, 404)
        self.assertEqual(self.client.get("/api/v1/evidence/freshness/scan").status_code, 405)


if __name__ == "__main__":
    unittest.main()

