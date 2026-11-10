from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
L = {"X-Role": "leader", "X-User-Id": "lead-1"}
I = {"X-Role": "incoming", "X-User-Id": "u-incoming-01"}


def test_full_flow():
    assert c.post("/projects/api1/demo").status_code == 200
    assert c.get("/projects/api1/risk-map").status_code == 401           # no role header
    assert c.get("/projects/api1/risk-map", headers=I).status_code == 403
    rm = c.get("/projects/api1/risk-map", headers=L).json()
    assert rm["units"][0]["unit"] == "backend/payments" and rm["units"][0]["level"] == "High"

    r = c.post("/projects/api1/readiness/evaluate", headers=L).json()
    assert r["state"] == "Needs Attention"
    assert c.post("/projects/api1/handover/approve", headers=L).status_code == 409
    assert c.get("/projects/api1/handover", headers=I).status_code == 403

    for kind, i, extra in [("finding", "F-03", {}), ("finding", "F-04", {"resolve": True}), ("finding", "F-05", {"resolve": True}),
                           ("finding", "F-06", {"resolve": True}), ("task", "T-07", {"owner_unknown": True}),
                           ("task", "T-12", {"owner_unknown": True}), ("task", "T-19", {"owner_unknown": True}), ("task", "T-14", {})]:
        assert c.post("/projects/api1/signoff", json={"kind": kind, "id": i, **extra}, headers=L).status_code == 200
    assert c.post("/projects/api1/readiness/evaluate", headers=L).json()["state"] == "Ready for Review"
    assert c.post("/projects/api1/handover/approve", headers=I).status_code == 403

    ap = c.post("/projects/api1/handover/approve", headers=L)
    assert ap.status_code == 200 and ap.json()["version"] == 1
    h = c.get("/projects/api1/handover", headers=I)
    assert h.status_code == 200 and h.json()["content_hash"] == ap.json()["content_hash"]
    assert c.get("/projects/api1/handover", headers={"X-Role": "outgoing", "X-User-Id": "x"}).status_code == 403

    assert c.post("/projects/api1/handover/versions/1/receipt", headers=I).status_code == 200
    vs = c.get("/projects/api1/handover/versions", headers=L).json()
    assert len(vs["versions"]) == 1 and len(vs["receipts"]) == 1

    pdf = c.get("/projects/api1/handover/versions/1/pdf", headers=I)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
