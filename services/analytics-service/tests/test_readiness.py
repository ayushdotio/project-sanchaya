from app.readiness.engine import APPROVED, NEEDS_ATTENTION, READY_FOR_REVIEW, evaluate, snapshot_hash
from app.handover import assembly


def test_initial_state_matches_answer_key(project, data):
    r = evaluate(project)
    key = data["answer_key"]
    assert r["state"] == NEEDS_ATTENTION == key["initial_state"]
    assert [i for i in r["failing_rules"] if i != 7] == [i for i in key["initial_failing_rules"]]


def test_each_failing_rule_has_reason(project):
    for rule in evaluate(project)["rules"]:
        if not rule["passed"]:
            assert rule["reasons"]


def test_ready_for_review_after_fixes(ready_project):
    r = evaluate(ready_project)
    assert r["state"] == READY_FOR_REVIEW and r["failing_rules"] == [7]


def test_unscanned_source_fails_rule_1(ready_project):
    ready_project["sources"][0]["scan_completed"] = False
    r = evaluate(ready_project)
    assert 1 in r["failing_rules"] and r["state"] == NEEDS_ATTENTION


def test_missing_required_source_type(ready_project):
    r = evaluate(ready_project, required_source_types=["jira"])
    assert 1 in r["failing_rules"]


def test_recipient_rule(ready_project):
    ready_project["recipient"]["scope"] = []
    assert 6 in evaluate(ready_project)["failing_rules"]


def test_approval_invalidated_when_content_changes(ready_project):
    assembly.approve(ready_project, "lead-1", "leader")
    assert evaluate(ready_project)["state"] == APPROVED
    ready_project["findings"][0]["text"] = "Use Django for the backend"   # change after approval
    r = evaluate(ready_project)
    assert r["state"] == READY_FOR_REVIEW and 7 in r["failing_rules"]
    assert any("no longer valid" in x for x in r["rules"][6]["reasons"])


def test_approval_must_be_by_leader(ready_project):
    ready_project["approval"] = {"approved_by": "x", "approved_by_role": "incoming",
                                 "approved_at": "now", "snapshot_hash": snapshot_hash(ready_project)}
    assert evaluate(ready_project)["state"] == READY_FOR_REVIEW


def test_snapshot_hash_stable(project):
    assert snapshot_hash(project) == snapshot_hash(project)
