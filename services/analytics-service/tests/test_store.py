import mongomock
from fastapi.testclient import TestClient

from app.handover import assembly
from app.store import MongoStore, ProjectStore
from data.synthetic.generate import demo_project


def test_mongo_store_roundtrip_with_dotted_emails():
    s = MongoStore(client=mongomock.MongoClient())
    p = demo_project("m1")                       # alias_map keys contain dots
    s.put("m1", p)
    assert s.get("m1")["alias_map"] == p["alias_map"]


def test_mongo_store_missing_raises():
    import pytest
    with pytest.raises(KeyError):
        MongoStore(client=mongomock.MongoClient()).get("nope")


def test_versions_and_receipts_survive_restart(ready_project):
    client = mongomock.MongoClient()
    s1 = MongoStore(client=client)
    assembly.approve(ready_project, "lead", "leader")
    assembly.acknowledge(ready_project, 1, "u-incoming-01")
    s1.put("p", ready_project)
    s2 = MongoStore(client=client)               # "restarted" service, same database
    p = s2.get("p")
    assert len(p["versions"]) == 1 and len(p["receipts"]) == 1
    assert assembly.get_handover(p, "incoming", "u-incoming-01")["version"] == 1


def test_api_works_with_mongo_store(monkeypatch):
    import app.routers_prakhar as r
    from app.main import app
    monkeypatch.setattr(r, "STORE", MongoStore(client=mongomock.MongoClient()))
    c = TestClient(app)
    L = {"X-Role": "Team Leader", "X-User-Id": "lead-1"}           # role alias accepted
    assert c.post("/projects/mg/demo").status_code == 200
    assert c.get("/projects/mg/risk-map", headers=L).json()["units"][0]["unit"] == "backend/payments"
    assert c.post("/projects/mg/signoff", json={"kind": "finding", "id": "F-03"}, headers=L).status_code == 200
    # change was persisted to the store, not just to memory
    assert r.STORE.get("mg")["findings"][2]["reviewer_signoff"] is True


def test_health_reports_store():
    from app.main import app
    h = TestClient(app).get("/health").json()
    assert h["status"] == "healthy" and h["store"] in ("memory", "file", "mongo")
