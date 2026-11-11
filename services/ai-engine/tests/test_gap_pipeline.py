import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.core.config import get_settings
from app.models.schemas import EvidenceStatus, FindingCategory, GapCategory
from app.services.gap_detector import DetectedGap, detect_gaps
from app.services.gap_question_generator import (
    generate_gap_question,
    persist_gap_questions,
    phrase_gap_question,
)
from app.services.pipeline import run_extract_and_verify


class _InsertManyResult:
    def __init__(self, inserted_ids):
        self.inserted_ids = inserted_ids


class _InMemoryCollection:
    def __init__(self, initial=None):
        self.docs = list(initial or [])
        self._seq = len(self.docs)

    def _matches(self, doc, filt):
        for key, expected in (filt or {}).items():
            val = doc.get(key)
            if isinstance(expected, dict) and "$in" in expected:
                if val not in expected["$in"]:
                    return False
            elif val != expected:
                return False
        return True

    def find(self, filt=None, projection=None):
        return [dict(d) for d in self.docs if self._matches(d, filt)]

    def find_one(self, filt=None):
        for d in self.docs:
            if self._matches(d, filt):
                return dict(d)
        return None

    def insert_many(self, docs):
        ids = []
        for doc in docs:
            copy = dict(doc)
            if "_id" not in copy:
                self._seq += 1
                copy["_id"] = f"507f1f77bcf86cd79943{self._seq:04d}"
            self.docs.append(copy)
            ids.append(copy["_id"])
        return _InsertManyResult(ids)

    def delete_many(self, filt):
        self.docs = [d for d in self.docs if not self._matches(d, filt)]


class _InMemoryDatabase:
    def __init__(self):
        self.collections = {
            "source_records": _InMemoryCollection(),
            "findings": _InMemoryCollection(),
            "gap_questions": _InMemoryCollection(),
        }

    def __getitem__(self, name):
        return self.collections.setdefault(name, _InMemoryCollection())


class TestGapPipeline(unittest.TestCase):

    def tearDown(self):
        get_settings.cache_clear()

    def test_gap_detector_flags_all_four_categories_and_skips_plain_needs_review(self):
        findings = [
            {
                "_id": "f1",
                "category": "task",
                "claim": "Configure webhook DLQ",
                "source_id": "SRC-TSK-001",
                "verification_status": "Supported",
                "owner": None,
                "topic": "webhooks",
            },
            {
                "_id": "f2",
                "category": "decision",
                "claim": "Adopt FastAPI for AI microservice",
                "source_id": "SRC-DOC-001",
                "verification_status": "Supported",
                "rationale": None,
                "topic": "framework",
            },
            {
                "_id": "f3",
                "category": "blocker",
                "claim": "Stripe test webhook secret missing",
                "source_id": "SRC-DOC-999",
                "verification_status": "Unknown",
                "topic": "stripe",
            },
            {
                "_id": "f4",
                "category": "decision",
                "claim": "Use Redis sessions",
                "source_id": "SRC-DOC-002",
                "verification_status": "Conflicting",
                "topic": "authentication",
                "conflict_details": {
                    "all_versions": [
                        {"source_id": "SRC-DOC-002", "claim": "Use Redis sessions"},
                        {"source_id": "SRC-GH-004", "claim": "Use stateless JWT"},
                    ]
                },
            },
            # Duplicate conflicting finding on same topic should not duplicate question
            {
                "_id": "f5",
                "category": "decision",
                "claim": "Use stateless JWT",
                "source_id": "SRC-GH-004",
                "verification_status": "Conflicting",
                "topic": "authentication",
            },
            # Plain Needs review (has owner/rationale) goes to Team Leader, not gap loop
            {
                "_id": "f6",
                "category": "decision",
                "claim": "Use Tailwind CSS",
                "source_id": "SRC-DOC-003",
                "verification_status": "Needs review",
                "rationale": "Faster UI iteration",
                "topic": "styling",
            },
        ]

        gaps = detect_gaps(findings)
        categories = [g.gap_category for g in gaps]
        self.assertEqual(
            categories,
            [
                GapCategory.MISSING_OWNER,
                GapCategory.MISSING_RATIONALE,
                GapCategory.UNKNOWN_CLAIM,
                GapCategory.CONFLICTING_SOURCES,
            ],
        )

    def test_generate_gap_question_routes_needs_review_to_none(self):
        self.assertIsNone(generate_gap_question("UI framework", EvidenceStatus.SUPPORTED))
        self.assertIsNone(generate_gap_question("UI framework", EvidenceStatus.NEEDS_REVIEW))

        q = generate_gap_question(
            "Session store",
            EvidenceStatus.CONFLICTING,
            conflicting_values=["Redis", "JWT"],
        )
        self.assertIsNotNone(q)
        self.assertIn("Session store", q)

    def test_phrase_gap_question_uses_llm_and_falls_back_on_error(self):
        gap = DetectedGap(
            gap_category=GapCategory.MISSING_OWNER,
            finding_id="f1",
            topic="webhooks",
            claim="Add webhook retry queue",
            category=FindingCategory.TASK,
            source_id="SRC-TSK-001",
            verification_status=EvidenceStatus.SUPPORTED,
        )

        def mock_llm(_sys, _usr):
            return '{"question": "Who owns the webhook retry queue task from SRC-TSK-001?"}'

        phrased = phrase_gap_question(gap, llm_client=mock_llm)
        self.assertEqual(phrased, "Who owns the webhook retry queue task from SRC-TSK-001?")

        def failing_llm(_sys, _usr):
            raise RuntimeError("Simulated LLM outage")

        fallback = phrase_gap_question(gap, llm_client=failing_llm)
        self.assertIn("Add webhook retry queue", fallback)
        self.assertIn("SRC-TSK-001", fallback)

    def test_end_to_end_pipeline_persists_canonical_findings_and_gap_questions(self):
        project_id = "507f1f77bcf86cd799439011"
        now = datetime.now(timezone.utc)
        db = _InMemoryDatabase()
        db["source_records"].insert_many(
            [
                {
                    "projectId": project_id,
                    "source_id": "SRC-DOC-001",
                    "source_type": "document",
                    "origin": "Architecture Notes",
                    "raw_filename": "architecture.md",
                    "redacted_content": "We decided to use stateless JWT authentication because it simplifies container scaling.",
                    "created_at": now - timedelta(days=5),
                    "updated_at": now - timedelta(days=5),
                    "imported_at": now,
                    "metadata": {"url": "https://example.com/arch"},
                },
                {
                    "projectId": project_id,
                    "source_id": "SRC-TSK-002",
                    "source_type": "task",
                    "origin": "tasks.csv",
                    "raw_filename": "tasks.csv",
                    "redacted_content": "TSK-008: Wire dead-letter retry in webhookWorker.ts",
                    "created_at": now - timedelta(days=1),
                    "updated_at": now - timedelta(days=1),
                    "imported_at": now,
                    "metadata": {},
                },
            ]
        )

        def fake_extractor(_sys, _usr):
            return json.dumps(
                {
                    "findings": [
                        {
                            "category": "decision",
                            "claim": "Use stateless JWT authentication",
                            "source_id": "SRC-DOC-001",
                            "verbatim_excerpt": "decided to use stateless JWT authentication because it simplifies container scaling",
                            "rationale": "Simplifies container scaling",
                            "topic": "authentication",
                        },
                        {
                            "category": "task",
                            "claim": "Wire dead-letter retry in webhookWorker.ts",
                            "source_id": "SRC-TSK-002",
                            "verbatim_excerpt": "Wire dead-letter retry in webhookWorker.ts",
                            "owner": None,
                            "deadline": None,
                            "topic": "webhooks",
                        },
                        {
                            "category": "blocker",
                            "claim": "Missing Stripe webhook secret",
                            "source_id": "SRC-DOC-404",
                            "verbatim_excerpt": "Stripe secret missing",
                            "topic": "stripe",
                        },
                    ]
                }
            )

        def fake_question_llm(_sys, user_prompt):
            return json.dumps({"question": f"Please clarify: {user_prompt.splitlines()[1]}?"})

        with patch.dict(os.environ, {"FRESHNESS_MAX_AGE_DAYS": "90"}, clear=False):
            get_settings.cache_clear()
            response = run_extract_and_verify(
                project_id_str=project_id,
                db=db,
                extractor_llm_client=fake_extractor,
                question_llm_client=fake_question_llm,
            )

        self.assertTrue(response.success)
        self.assertEqual(response.findingsCount, 3)
        self.assertEqual(response.supportedCount, 1)
        self.assertEqual(response.gapsGenerated, 2)

        persisted_findings = db["findings"].find({"projectId": project_id})
        self.assertEqual(len(persisted_findings), 3)
        statuses = {f["source_id"]: f["verification_status"] for f in persisted_findings}
        self.assertEqual(statuses["SRC-DOC-001"], "Supported")
        self.assertEqual(statuses["SRC-TSK-002"], "Needs review")
        self.assertEqual(statuses["SRC-DOC-404"], "Unknown")

        # Verify freshness indicator attached alongside status
        doc_finding = next(f for f in persisted_findings if f["source_id"] == "SRC-DOC-001")
        self.assertTrue(doc_finding["freshness"]["recheck_recommended"])
        self.assertEqual(doc_finding["evidence_origin"], "system")
        self.assertEqual(doc_finding["review_status"], "pending")

        persisted_questions = db["gap_questions"].find({"projectId": project_id})
        self.assertEqual(len(persisted_questions), 2)
        for q in persisted_questions:
            self.assertEqual(q["status"], "pending")
            self.assertEqual(q["evidence_badge"], "Self-reported")

    def test_pipeline_accepts_source_records_override_from_backend(self):
        project_id = "507f1f77bcf86cd799439012"
        now = datetime.now(timezone.utc)
        db = _InMemoryDatabase()  # Empty source_records collection in DB

        override_sources = [
            {
                "source_id": "SRC-DOC-OVERRIDE",
                "source_type": "document",
                "origin": "notes.md",
                "raw_filename": "notes.md",
                "redacted_content": "Decided to use OpenRouter for LLM extraction.",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "imported_at": now.isoformat(),
                "metadata": {},
            }
        ]

        def fake_extractor(_sys, _usr):
            return json.dumps(
                {
                    "findings": [
                        {
                            "category": "decision",
                            "claim": "Use OpenRouter for LLM extraction",
                            "source_id": "SRC-DOC-OVERRIDE",
                            "verbatim_excerpt": "Decided to use OpenRouter for LLM extraction.",
                            "rationale": "Unified multi-model routing",
                            "topic": "llm",
                        }
                    ]
                }
            )

        response = run_extract_and_verify(
            project_id_str=project_id,
            db=db,
            extractor_llm_client=fake_extractor,
            source_records_override=override_sources,
        )
        self.assertTrue(response.success)
        self.assertEqual(response.findingsCount, 1)
        self.assertEqual(response.supportedCount, 1)
        self.assertEqual(len(db["findings"].find({"projectId": project_id})), 1)


if __name__ == "__main__":
    unittest.main()

