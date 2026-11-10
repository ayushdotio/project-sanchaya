from app.analytics.risk_analyzer import analyze


def run(data):
    return analyze(data["commits"], data["tasks"], data["departing_member"], data["alias_map"])


def unit(res, name):
    return next((u for u in res["units"] if u["unit"] == name), None)


def test_planted_high_unit_found(data):
    res, key = run(data), data["answer_key"]
    for name in key["expected_high_units"]:
        assert unit(res, name)["level"] == "High"
    assert unit(res, "backend/payments")["top_contributor"] == "Aarav Kulkarni"


def test_evenly_shared_modules_not_high(data):
    res, key = run(data), data["answer_key"]
    for name in key["expected_not_high_units"]:
        assert unit(res, name)["level"] != "High", name


def test_dormant_module_downgraded(data):
    u = unit(run(data), "legacy/importer")
    assert u["level"] == "Medium" and any("dormant" in n for n in u["notes"])


def test_insufficient_data_label(data):
    assert unit(run(data), "scripts")["level"] == "Insufficient data"


def test_bots_ignored(data):
    res = run(data)
    assert data["answer_key"]["bot_must_be_ignored"] not in res["contributors"]
    assert all("bot" not in n.lower() for u in res["units"] for n in u["contributor_commits"])


def test_identity_merge_two_emails_one_person(data):
    res = run(data)
    assert res["contributors"].count("Aarav Kulkarni") == 1
    assert not any("aarav kulkarni" == c for c in res["contributors"])
    # without alias map the same person is split and concentration drops
    split = analyze(data["commits"], alias_map={})
    assert unit(split, "backend/payments")["top_commit_share"] < unit(res, "backend/payments")["top_commit_share"]


def test_bulk_edit_disagreement_flagged(data):
    notes = unit(run(data), "frontend/src")["notes"]
    assert any("disagree" in n for n in notes)


def test_task_risk_matches_answer_key(data):
    tr = run(data)["task_risk"]
    key = data["answer_key"]
    assert sorted(tr["unowned"]) == sorted(key["unowned_open_tasks"])
    assert tr["blocked_without_blocker"] == key["blocked_without_blocker"]
    assert sorted(tr["departing_member_open_tasks"]) == sorted(key["departing_member_open_tasks"])


def test_departing_member_units_and_wording(data):
    res = run(data)
    assert "backend/payments" in res["departing_member_risk_units"]
    assert unit(res, "backend/payments")["wording"] == "potential knowledge-risk area"
    assert "performance" in res["disclaimer"]


def test_deterministic(data):
    assert run(data) == run(data)


def test_empty_input():
    res = analyze([], [])
    assert res["units"] == [] and res["as_of"] is None
