import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.analytics.risk_analyzer import analyze
from app.canonical import compute_risk_and_readiness_for_project, parse_object_id
from app.handover import assembly
from app.readiness.engine import APPROVED, READY_FOR_REVIEW, evaluate
from data.synthetic.generate import demo_project


class _FakeCollection:
    def __init__(self, initial=None):
        self.docs = list(initial or [])
        self._seq = len(self.docs)

    def _matches(self, doc, filt):
        for k, expected in (filt or {}).items():
            val = doc.get(k)
            if isinstance(expected, dict) and "$in" in expected:
                if val not in expected["$in"]:
                    return False
            elif val != expected:
                return False
        return True

    def find(self, filt=None):
        return [dict(d) for d in self.docs if self._matches(d, filt)]

    def find_one(self, filt=None):
        for d in self.docs:
            if self._matches(d, filt):
                return dict(d)
        return None

    def insert_many(self, docs):
        for doc in docs:
            copy = dict(doc)
            if "_id" not in copy:
                self._seq += 1
                copy["_id"] = f"doc-{self._seq}"
            self.docs.append(copy)

    def delete_many(self, filt):
        self.docs = [d for d in self.docs if not self._matches(d, filt)]

    def update_one(self, filt, update):
        for d in self.docs:
            if self._matches(d, filt):
                d.update(update.get("$set", {}))
                return


class _FakeDatabase:
    def __init__(self):
        self.collections = {
            "projects": _FakeCollection(),
            "source_records": _FakeCollection(),
            "findings": _FakeCollection(),
            "gap_questions": _FakeCollection(),
            "risk_maps": _FakeCollection(),
            "handover_history": _FakeCollection(),
            "users": _FakeCollection(),
        }

    def list_collection_names(self):
        return list(self.collections.keys())

    def __getitem__(self, name):
        return self.collections.setdefault(name, _FakeCollection())


class TestAnalyticsFixes(unittest.TestCase):

    def test_bot_only_commits_do_not_crash(self):
        commits = [
            {
                "sha": "b1",
                "author": "dependabot[bot]",
                "email": "49699333+dependabot[bot]@users.noreply.github.com",
                "timestamp": "2026-10-01T12:00:00Z",
                "files": [{"path": "requirements.txt", "additions": 1, "deletions": 1}],
            }
        ]
        res = analyze(commits, tasks=[])
        self.assertEqual(res["units"], [])
        self.assertEqual(res["contributors"], [])
        self.assertIsNotNone(res["as_of"])

    def test_task_groups_and_single_contributor_tasks(self):
        tasks = [
            {"id": "T-1", "title": "Webhook DLQ", "assignee": "Aarav", "status": "open", "group": "payments"},
            {"id": "T-2", "title": "Refund retry", "assignee": "Aarav", "status": "open", "group": "payments"},
            {
                "id": "T-3",
                "title": "Auth tests",
                "assignee": "Meera",
                "second_contributor": "Rohan",
                "status": "open",
                "group": "auth",
            },
        ]
        res = analyze([], tasks=tasks)
        self.assertEqual(res["task_risk"]["single_contributor_tasks"], ["T-1", "T-2"])
        pay_group = next(g for g in res["task_groups"] if g["task_group"] == "payments")
        self.assertEqual(pay_group["level"], "High")
        self.assertEqual(pay_group["top_contributor"], "Aarav")

    def test_recipient_scope_filters_incoming_handover(self):
        p = demo_project("scope-test")
        for f in p["findings"]:
            if f["id"] == "F-03":
                f["reviewer_signoff"] = True
            if f["id"] in ("F-04", "F-05", "F-06"):
                f["resolved"] = True
        for t in p["tasks"]:
            if t["id"] in ("T-07", "T-12", "T-19"):
                t["owner_unknown"] = True
            if t["id"] == "T-14":
                t["reviewer_signoff"] = True

        # Restrict incoming scope to decisions only
        p["recipient"]["scope"] = ["decisions"]
        assembly.approve(p, "lead-1", "leader")
        out = assembly.get_handover(p, "incoming", "u-incoming-01")
        content = out["content"]
        self.assertGreater(len(content["decisions"]), 0)
        self.assertEqual(content["tasks"], [])
        self.assertEqual(content["dependencies"], [])
        self.assertEqual(content["risk_areas"], [])
        self.assertEqual(content["open_gaps"], [])

    def test_canonical_compute_persists_risk_maps_and_invalidates_stale_approval(self):
        pid = "672f8b9c1a2b3c4d5e6f7a99"
        now = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
        db = _FakeDatabase()
        db["users"].insert_many(
            [
                {"_id": "u-out-1", "name": "Aarav Kulkarni", "email": "aarav@sanchaya.dev"},
                {"_id": "u-inc-1", "name": "Kabir Deshmukh", "email": "kabir@sanchaya.dev"},
            ]
        )
        db["projects"].insert_many(
            [
                {
                    "_id": pid,
                    "name": "Sanchaya Handover",
                    "githubRepo": "epsilum/sanchaya",
                    "members": {
                        "leaderId": "u-lead-1",
                        "outgoingIds": ["u-out-1"],
                        "incomingIds": ["u-inc-1"],
                    },
                    "readinessChecklist": {"leaderApprovalRecorded": True},
                    "readinessStatus": APPROVED,
                    "approvedBy": "u-lead-1",
                    "approvedAt": now,
                    "approvedSnapshotHash": "stale-hash-from-before-edit",
                }
            ]
        )
        db["source_records"].insert_many(
            [
                {
                    "projectId": pid,
                    "source_id": "SRC-GH-001",
                    "source_type": "github",
                    "origin": "commit-1",
                    "redacted_content": "Updated services/payments/webhook.ts retry logic",
                    "metadata": {"author": "Aarav Kulkarni", "redactionCount": 0, "filePath": "services/payments/webhook.ts"},
                    "created_at": now,
                    "updated_at": now,
                }
            ]
        )
        db["findings"].insert_many(
            [
                {
                    "_id": "f-1",
                    "projectId": pid,
                    "category": "decision",
                    "claim": "Use stateless JWT",
                    "source_id": "SRC-GH-001",
                    "verbatim_excerpt": "Updated services/payments/webhook.ts retry logic",
                    "verification_status": "Supported",
                    "review_status": "approved",
                    "evidence_origin": "system",
                }
            ]
        )

        result = compute_risk_and_readiness_for_project(db, pid)
        self.assertTrue(result["success"])
        # Hash mismatch invalidates stale approval (WR-02)
        self.assertEqual(result["readinessStatus"], READY_FOR_REVIEW)
        self.assertFalse(result["checklist"]["leaderApprovalRecorded"])

        updated_proj = db["projects"].find_one({"_id": pid})
        self.assertEqual(updated_proj["readinessStatus"], READY_FOR_REVIEW)
        self.assertIsNone(updated_proj["approvedBy"])

        risk_maps = db["risk_maps"].find({"projectId": {"$in": [parse_object_id(pid), pid]}})
        self.assertEqual(len(risk_maps), 1)
        self.assertEqual(risk_maps[0]["modulePath"], "services/payments")


if __name__ == "__main__":
    unittest.main()
