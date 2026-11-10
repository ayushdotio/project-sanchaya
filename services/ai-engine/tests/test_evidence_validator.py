import unittest

from app.models.schemas import EvidenceStatus
from app.services.evidence_validator import validate_evidence


class TestEvidenceValidator(unittest.TestCase):

    def test_supported_evidence(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "use MongoDB",
            "meeting-001"
        )
        self.assertEqual(result.status, EvidenceStatus.SUPPORTED)

    def test_needs_review(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "use PostgreSQL",
            "meeting-001"
        )
        self.assertEqual(result.status, EvidenceStatus.NEEDS_REVIEW)

    def test_conflicting_evidence(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "use MongoDB",
            "meeting-001",
            has_conflict=True
        )
        self.assertEqual(result.status, EvidenceStatus.CONFLICTING)

    def test_unknown_evidence(self):
        result = validate_evidence(
            None,
            None,
            "meeting-001"
        )
        self.assertEqual(result.status, EvidenceStatus.UNKNOWN)

    def test_automatic_conflict_detection(self):
        from app.models.schemas import DecisionFact

        facts = [
            DecisionFact(
                topic="Database",
                value="MongoDB",
                source_id="meeting-001",
                evidence_excerpt="We chose MongoDB.",
                recorded_at="2026-11-09",
            ),
            DecisionFact(
                topic="Database",
                value="PostgreSQL",
                source_id="meeting-002",
                evidence_excerpt="We chose PostgreSQL.",
                recorded_at="2026-11-10",
            ),
        ]

        result = validate_evidence(
            "We chose MongoDB.",
            "We chose MongoDB.",
            "meeting-001",
            facts=facts,
        )

        self.assertEqual(result.status, EvidenceStatus.CONFLICTING)


if __name__ == "__main__":
    unittest.main()
