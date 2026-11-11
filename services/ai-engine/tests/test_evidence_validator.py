import unittest

from app.models.schemas import (
    DecisionFact,
    EvidenceStatus,
    ExtractedFindingCandidate,
    FindingCategory,
)
from app.services.evidence_validator import (
    analyze_conflicts,
    contains_negation,
    detect_candidate_conflicts,
    detect_conflict,
    validate_evidence,
    validate_finding_against_sources,
)


class TestEvidenceValidator(unittest.TestCase):

    def test_status_enum_casing_matches_backend(self):
        self.assertEqual(EvidenceStatus.SUPPORTED.value, "Supported")
        self.assertEqual(EvidenceStatus.NEEDS_REVIEW.value, "Needs review")
        self.assertEqual(EvidenceStatus.CONFLICTING.value, "Conflicting")
        self.assertEqual(EvidenceStatus.UNKNOWN.value, "Unknown")

    def test_supported_evidence(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "use MongoDB",
            "meeting-001",
        )
        self.assertEqual(result.status, EvidenceStatus.SUPPORTED)

    def test_needs_review(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "use PostgreSQL",
            "meeting-001",
        )
        self.assertEqual(result.status, EvidenceStatus.NEEDS_REVIEW)

    def test_conflicting_evidence(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "use MongoDB",
            "meeting-001",
            has_conflict=True,
        )
        self.assertEqual(result.status, EvidenceStatus.CONFLICTING)

    def test_unknown_evidence(self):
        result = validate_evidence(None, None, "meeting-001")
        self.assertEqual(result.status, EvidenceStatus.UNKNOWN)

    def test_automatic_conflict_detection(self):
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
        self.assertIsNotNone(result.conflict_details)
        self.assertEqual(result.conflict_details.earlier_version.source_id, "meeting-001")
        self.assertEqual(result.conflict_details.newer_version.source_id, "meeting-002")

    def test_conflict_does_not_leak_to_unrelated_findings(self):
        facts = [
            DecisionFact(
                topic="Database",
                value="MongoDB",
                source_id="SRC-DOC-001",
                evidence_excerpt="We chose MongoDB.",
                recorded_at="2026-11-09",
            ),
            DecisionFact(
                topic="Database",
                value="PostgreSQL",
                source_id="SRC-GH-002",
                evidence_excerpt="Migrated to PostgreSQL.",
                recorded_at="2026-11-10T14:00:00Z",
            ),
        ]

        unrelated = validate_evidence(
            "We use JWT for auth.",
            "use JWT for auth",
            source_id="SRC-GH-003",
            topic="Authentication",
            facts=facts,
        )
        self.assertEqual(unrelated.status, EvidenceStatus.SUPPORTED)

    def test_mixed_naive_and_aware_timestamps_supersession(self):
        facts = [
            DecisionFact(
                topic="Database",
                value="Redis",
                source_id="SRC-DOC-001",
                evidence_excerpt="Initial plan: Redis.",
                recorded_at="2026-11-09",
            ),
            DecisionFact(
                topic="Database",
                value="MongoDB",
                source_id="SRC-GH-002",
                evidence_excerpt="Updated plan: MongoDB.",
                recorded_at="2026-11-10T14:00:00Z",
                supersedes_source_id="SRC-DOC-001",
            ),
        ]
        self.assertFalse(detect_conflict(facts))
        self.assertEqual(analyze_conflicts(facts), {})

    def test_case_insensitive_matching(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "THE TEAM DECIDED TO USE MONGODB.",
            "meeting-002",
        )
        self.assertEqual(result.status, EvidenceStatus.SUPPORTED)

    def test_whitespace_normalization(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "The team   decided\nto use MongoDB.",
            "meeting-003",
        )
        self.assertEqual(result.status, EvidenceStatus.SUPPORTED)

    def test_partial_word_match_needs_review(self):
        result = validate_evidence(
            "The team decided to use MongoDB.",
            "Mongo",
            "meeting-004",
        )
        self.assertEqual(result.status, EvidenceStatus.NEEDS_REVIEW)

    def test_redacted_token_and_punctuation_boundary_matching(self):
        result = validate_evidence(
            "Configured auth with [REDACTED_SECRET] and (JWT auth).",
            "[REDACTED_SECRET]",
            "SRC-GH-010",
        )
        self.assertEqual(result.status, EvidenceStatus.SUPPORTED)

        paren_result = validate_evidence(
            "Configured auth with [REDACTED_SECRET] and (JWT auth).",
            "(JWT auth).",
            "SRC-GH-010",
        )
        self.assertEqual(paren_result.status, EvidenceStatus.SUPPORTED)

    def test_detect_explicit_negation_and_clause_polarity(self):
        self.assertTrue(contains_negation("The team did not approve MongoDB."))
        self.assertTrue(contains_negation("Redis isn't used in production."))
        self.assertTrue(contains_negation("Session cookies were deprecated."))
        self.assertFalse(contains_negation("The team approved MongoDB."))

        # Clause-scoped polarity: negative in first clause should not poison positive second clause
        supported = validate_evidence(
            source_text="We did not use Redis; we chose MongoDB.",
            evidence_excerpt="We did not use Redis; we chose MongoDB.",
            claim="The team chose MongoDB.",
        )
        self.assertEqual(supported.status, EvidenceStatus.SUPPORTED)

        mismatched = validate_evidence(
            source_text="We did not use Redis; we chose MongoDB.",
            evidence_excerpt="We did not use Redis; we chose MongoDB.",
            claim="The team chose Redis.",
        )
        self.assertEqual(mismatched.status, EvidenceStatus.NEEDS_REVIEW)

    def test_negated_evidence_does_not_support_positive_claim(self):
        result = validate_evidence(
            source_text="The team did not approve MongoDB.",
            evidence_excerpt="The team did not approve MongoDB.",
            claim="The team approved MongoDB.",
        )
        self.assertEqual(result.status, EvidenceStatus.NEEDS_REVIEW)

    def test_db_backed_validation_rules(self):
        sources_by_id = {
            "SRC-DOC-001": {
                "source_id": "SRC-DOC-001",
                "source_type": "document",
                "origin": "Architecture Notes",
                "raw_filename": "arch_notes.md",
                "redacted_content": "We decided to use stateless JWT authentication for scaling.",
                "updated_at": "2026-10-01T10:00:00Z",
                "metadata": {"url": "https://example.com/doc/1"},
            },
            "SRC-DOC-002": {
                "source_id": "SRC-DOC-002",
                "source_type": "document",
                "origin": "Slack chat",
                "raw_filename": "informal_chat.txt",
                "redacted_content": "Maybe use RabbitMQ for background jobs.",
                "updated_at": "2026-10-02T10:00:00Z",
                "metadata": {},
            },
            "SRC-TSK-001": {
                "source_id": "SRC-TSK-001",
                "source_type": "task",
                "origin": "tasks.csv",
                "raw_filename": "tasks.csv",
                "redacted_content": "TSK-008: Implement webhook retry queue before launch.",
                "updated_at": "2026-10-05T10:00:00Z",
                "metadata": {},
            },
            "SRC-GH-001": {
                "source_id": "SRC-GH-001",
                "source_type": "github",
                "origin": "PR #42",
                "raw_filename": "",
                "redacted_content": "Switched authentication from JWT to Redis sessions.",
                "updated_at": "2026-10-15T10:00:00Z",
                "metadata": {"url": "https://github.com/org/repo/pull/42"},
            },
        }

        # 1. Missing source_id -> Unknown
        unknown_src = validate_finding_against_sources(
            ExtractedFindingCandidate(
                category=FindingCategory.DECISION,
                claim="Use GraphQL",
                source_id="SRC-DOC-999",
                verbatim_excerpt="Use GraphQL",
            ),
            sources_by_id,
        )
        self.assertEqual(unknown_src.status, EvidenceStatus.UNKNOWN)

        # 2. Fabricated excerpt -> Unknown
        fabricated = validate_finding_against_sources(
            ExtractedFindingCandidate(
                category=FindingCategory.DECISION,
                claim="Use GraphQL",
                source_id="SRC-DOC-001",
                verbatim_excerpt="Completely unrelated fabricated quote",
            ),
            sources_by_id,
        )
        self.assertEqual(fabricated.status, EvidenceStatus.UNKNOWN)

        # 3. Single informal note -> Needs review
        informal = validate_finding_against_sources(
            ExtractedFindingCandidate(
                category=FindingCategory.DECISION,
                claim="Use RabbitMQ for background jobs",
                source_id="SRC-DOC-002",
                verbatim_excerpt="Maybe use RabbitMQ for background jobs.",
                topic="queue",
            ),
            sources_by_id,
        )
        self.assertEqual(informal.status, EvidenceStatus.NEEDS_REVIEW)

        # 4. Task missing owner/deadline -> Needs review
        missing_owner = validate_finding_against_sources(
            ExtractedFindingCandidate(
                category=FindingCategory.TASK,
                claim="Implement webhook retry queue",
                source_id="SRC-TSK-001",
                verbatim_excerpt="Implement webhook retry queue before launch.",
                owner=None,
                deadline=None,
            ),
            sources_by_id,
        )
        self.assertEqual(missing_owner.status, EvidenceStatus.NEEDS_REVIEW)

        # 5. Cross-source temporal conflict -> Conflicting with both versions preserved
        conflict_candidates = [
            ExtractedFindingCandidate(
                category=FindingCategory.DECISION,
                claim="Use stateless JWT authentication",
                source_id="SRC-DOC-001",
                verbatim_excerpt="decided to use stateless JWT authentication",
                topic="authentication",
            ),
            ExtractedFindingCandidate(
                category=FindingCategory.DECISION,
                claim="Switched authentication to Redis sessions",
                source_id="SRC-GH-001",
                verbatim_excerpt="Switched authentication from JWT to Redis sessions.",
                topic="authentication",
            ),
        ]
        conflict_map, _ = detect_candidate_conflicts(conflict_candidates, sources_by_id)
        res = validate_finding_against_sources(
            conflict_candidates[0],
            sources_by_id,
            conflict_map=conflict_map,
        )
        self.assertEqual(res.status, EvidenceStatus.CONFLICTING)
        self.assertEqual(res.conflicting_source_id, "SRC-GH-001")
        self.assertIsNotNone(res.conflict_details)
        self.assertEqual(res.conflict_details.earlier_version.source_id, "SRC-DOC-001")
        self.assertEqual(res.conflict_details.newer_version.source_id, "SRC-GH-001")
        self.assertEqual(
            res.conflict_details.newer_version.url,
            "https://github.com/org/repo/pull/42",
        )


if __name__ == "__main__":
    unittest.main()
