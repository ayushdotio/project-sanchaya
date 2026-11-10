import pytest
from app.handover import assembly
from app.readiness.engine import APPROVED, evaluate


def test_cannot_approve_when_rules_fail(project):
    with pytest.raises(assembly.NotReady) as e:
        assembly.approve(project, "lead", "leader")
    assert 3 in e.value.readiness["failing_rules"]


def test_only_leader_can_approve(ready_project):
    with pytest.raises(assembly.AccessDenied):
        assembly.approve(ready_project, "u-incoming-01", "incoming")


def test_incoming_blocked_until_approved(project, ready_project):
    with pytest.raises(assembly.AccessDenied):
        assembly.get_handover(ready_project, "incoming", "u-incoming-01")


def test_zero_unapproved_content_leaks_to_incoming(ready_project):
    ready_project["findings"][2]["reviewer_signoff"] = False        # F-03 Needs review, no sign-off
    ready_project["findings"][2]["status"] = "Needs review"
    # F-03 now fails rule 2 -> cannot approve, so nothing reaches the incoming member
    with pytest.raises(assembly.NotReady):
        assembly.approve(ready_project, "lead", "leader")
    with pytest.raises(assembly.AccessDenied):
        assembly.get_handover(ready_project, "incoming", "u-incoming-01")


def test_approved_handover_contents(ready_project):
    v = assembly.approve(ready_project, "lead", "leader")
    assert v["version"] == 1 and len(v["content_hash"]) == 64
    out = assembly.get_handover(ready_project, "incoming", "u-incoming-01")
    c = out["content"]
    ids = [d["id"] for d in c["decisions"]]
    assert "F-01" in ids and "F-02" in ids
    assert "F-04" not in ids and "F-05" not in ids          # conflicts live in open_gaps, not decisions
    assert {g["id"] for g in c["open_gaps"]} == {"F-04", "F-05", "F-06"}   # disclosed, not hidden
    assert all(d["source_id"] for d in c["decisions"] + c["dependencies"])
    assert c["next_actions"][0]["priority"] == 1
    assert any(r["unit"] == "backend/payments" for r in c["risk_areas"])


def test_wrong_incoming_user_denied(ready_project):
    assembly.approve(ready_project, "lead", "leader")
    with pytest.raises(assembly.AccessDenied):
        assembly.get_handover(ready_project, "incoming", "someone-else")
    with pytest.raises(assembly.AccessDenied):
        assembly.get_handover(ready_project, "outgoing", "u-out")


def test_content_change_withholds_handover(ready_project):
    assembly.approve(ready_project, "lead", "leader")
    ready_project["tasks"][0]["title"] = "tampered"
    with pytest.raises(assembly.AccessDenied):
        assembly.get_handover(ready_project, "incoming", "u-incoming-01")


def test_versions_immutable_and_numbered(ready_project):
    v1 = assembly.approve(ready_project, "lead", "leader")
    ready_project["findings"][0]["excerpt"] = "edited"
    v2 = assembly.approve(ready_project, "lead", "leader")
    assert (v1["version"], v2["version"]) == (1, 2)
    assert v1["content_hash"] != v2["content_hash"]
    ready_project["versions"][0]["content"]["decisions"].clear()    # stored copy independent of returned dict
    vs = assembly.list_versions(ready_project)
    assert [x["version"] for x in vs] == [1, 2]


def test_receipt_logging(ready_project):
    assembly.approve(ready_project, "lead", "leader")
    r = assembly.acknowledge(ready_project, 1, "u-incoming-01")
    assert r["version"] == 1 and r["content_hash"] == ready_project["versions"][0]["content_hash"]
    assert len(ready_project["receipts"]) == 1
    with pytest.raises(assembly.AccessDenied):
        assembly.acknowledge(ready_project, 1, "intruder")
    with pytest.raises(KeyError):
        assembly.acknowledge(ready_project, 9, "u-incoming-01")


def test_leader_preview_flags_unapproved(project):
    out = assembly.get_handover(project, "leader")
    assert out["preview"] is True and out["readiness_state"] != APPROVED
