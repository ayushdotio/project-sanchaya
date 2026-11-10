"""Seeded synthetic project generator ("Campus Events App", 4 students).

Plants known problems and writes an answer key so every module can be tested
against ground truth. ALL DATA IS FICTIONAL.

Run:  python data/synthetic/generate.py   -> writes JSON files next to this script
"""
import json
import os
import random
from datetime import datetime, timedelta, timezone

SEED = 42
END = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
DAYS = 150

AARAV = ("Aarav Kulkarni", "aarav.k@college.edu")
AARAV_ALT = ("aarav kulkarni", "aarav.kulkarni@gmail.com")   # same person, 2nd identity
MEERA = ("Meera Joshi", "meera@college.edu")
ROHAN = ("Rohan Patil", "rohan@college.edu")
SANA = ("Sana Sheikh", "sana@college.edu")
BOT = ("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com")

ALIAS_MAP = {"aarav.kulkarni@gmail.com": "Aarav Kulkarni", "aarav.k@college.edu": "Aarav Kulkarni"}

# module -> (files, {author: weight}, recent?)  recent=False means dormant (no commits in last 90 days)
MODULES = {
    "backend/payments": (["backend/payments/gateway.py", "backend/payments/webhook.py", "backend/payments/refunds.py"],
                         {"A": 0.88, "M": 0.06, "R": 0.06}, True),
    "backend/auth":     (["backend/auth/login.py", "backend/auth/tokens.py"],
                         {"M": 0.50, "A": 0.25, "R": 0.25}, True),
    "frontend/src":     (["frontend/src/App.jsx", "frontend/src/Events.jsx", "frontend/src/Profile.jsx"],
                         {"R": 0.36, "S": 0.34, "M": 0.15, "A": 0.15}, True),
    "docs/guides":      (["docs/guides/setup.md", "docs/guides/api.md"],
                         {"S": 0.30, "R": 0.25, "M": 0.25, "A": 0.20}, True),
    "legacy/importer":  (["legacy/importer/csv_loader.py", "legacy/importer/mapper.py"],
                         {"A": 0.90, "M": 0.10}, False),
}
COUNTS = {"backend/payments": 40, "backend/auth": 24, "frontend/src": 36, "docs/guides": 16, "legacy/importer": 12}


def _allocate(n, weights):
    """Exact per-author counts (largest remainder) so planted shares are deterministic."""
    raw = {k: w * n for k, w in weights.items()}
    counts = {k: int(v) for k, v in raw.items()}
    left = n - sum(counts.values())
    for k in sorted(raw, key=lambda k: raw[k] - counts[k], reverse=True)[:left]:
        counts[k] += 1
    return counts


def generate():
    rng = random.Random(SEED)
    people = {"A": AARAV, "M": MEERA, "R": ROHAN, "S": SANA}
    commits, n = [], 0
    for mod, (files, weights, recent) in MODULES.items():
        authors = []
        for k, cnt in _allocate(COUNTS[mod], weights).items():
            authors += [k] * cnt
        rng.shuffle(authors)
        a_seen = 0
        for who in authors:
            name, email = people[who]
            if who == "A":
                a_seen += 1
                if a_seen % 3 == 0:                      # every 3rd Aarav commit uses his 2nd identity
                    name, email = AARAV_ALT
            day = rng.randint(100, DAYS) if not recent else rng.randint(0, DAYS)
            ts = END - timedelta(days=day, hours=rng.randint(0, 20))
            f = rng.choice(files)
            n += 1
            commits.append({"sha": f"c{n:04d}", "author": name, "email": email, "timestamp": ts.isoformat(),
                            "message": f"update {mod.split('/')[-1]}",
                            "files": [{"path": f, "additions": rng.randint(5, 60), "deletions": rng.randint(0, 25)}]})
    # tiny module -> Insufficient data
    for i in range(3):
        n += 1
        commits.append({"sha": f"c{n:04d}", "author": SANA[0], "email": SANA[1],
                        "timestamp": (END - timedelta(days=10 + i)).isoformat(), "message": "helper script",
                        "files": [{"path": "scripts/seed.py", "additions": 12, "deletions": 1}]})
    # bulk reformat by Sana: huge line count, one commit (commit/line shares disagree in frontend)
    n += 1
    commits.append({"sha": f"c{n:04d}", "author": SANA[0], "email": SANA[1],
                    "timestamp": (END - timedelta(days=5)).isoformat(), "message": "format all with prettier",
                    "files": [{"path": "frontend/src/Events.jsx", "additions": 2500, "deletions": 2300}]})
    # bot commits (must be ignored)
    for i in range(12):
        n += 1
        commits.append({"sha": f"c{n:04d}", "author": BOT[0], "email": BOT[1],
                        "timestamp": (END - timedelta(days=8 * i + 1)).isoformat(), "message": "bump dependency",
                        "files": [{"path": "backend/payments/requirements.txt", "additions": 1, "deletions": 1}]})
    commits.sort(key=lambda c: c["timestamp"])

    A = "Aarav Kulkarni"
    tasks = [
        {"id": "T-01", "title": "Set up CI pipeline", "assignee": "Rohan Patil", "status": "done", "blocker": None},
        {"id": "T-02", "title": "Razorpay webhook retry logic", "assignee": A, "status": "open", "blocker": None},
        {"id": "T-03", "title": "Refund flow edge cases", "assignee": A, "status": "open", "blocker": None},
        {"id": "T-04", "title": "Payment reconciliation report", "assignee": A, "status": "blocked", "blocker": "Waiting for gateway sandbox keys (T-02)"},
        {"id": "T-05", "title": "Migrate legacy CSV importer", "assignee": A, "status": "open", "blocker": None},
        {"id": "T-06", "title": "Rate limiting on login", "assignee": "Meera Joshi", "status": "open", "blocker": None},
        {"id": "T-07", "title": "Event cancellation emails", "assignee": None, "status": "open", "blocker": None},
        {"id": "T-08", "title": "Profile page redesign", "assignee": "Sana Sheikh", "status": "open", "blocker": None},
        {"id": "T-09", "title": "Write API docs for payments", "assignee": "Sana Sheikh", "status": "open", "blocker": None},
        {"id": "T-10", "title": "Accessibility audit", "assignee": "Rohan Patil", "status": "done", "blocker": None},
        {"id": "T-11", "title": "Load test events endpoint", "assignee": "Meera Joshi", "status": "open", "blocker": None},
        {"id": "T-12", "title": "Decide caching layer", "assignee": None, "status": "open", "blocker": None},
        {"id": "T-13", "title": "Fix timezone bug in calendar", "assignee": "Rohan Patil", "status": "done", "blocker": None},
        {"id": "T-14", "title": "Ticket PDF generation", "assignee": "Meera Joshi", "status": "blocked", "blocker": None},
        {"id": "T-15", "title": "Dark mode", "assignee": "Sana Sheikh", "status": "done", "blocker": None},
        {"id": "T-16", "title": "Set up error monitoring", "assignee": "Rohan Patil", "status": "open", "blocker": None},
        {"id": "T-17", "title": "Seed data script cleanup", "assignee": "Sana Sheikh", "status": "done", "blocker": None},
        {"id": "T-18", "title": "Token refresh rotation", "assignee": "Meera Joshi", "status": "done", "blocker": None},
        {"id": "T-19", "title": "Deploy checklist", "assignee": None, "status": "open", "blocker": None},
    ]

    sources = [
        {"source_id": "SRC-GH-01", "type": "github", "timestamp": END.isoformat(), "scan_completed": True},
        {"source_id": "SRC-NOTE-01", "type": "meeting_note", "timestamp": (END - timedelta(days=60)).isoformat(), "scan_completed": True},
        {"source_id": "SRC-NOTE-02", "type": "meeting_note", "timestamp": (END - timedelta(days=20)).isoformat(), "scan_completed": True},
        {"source_id": "SRC-CSV-01", "type": "task_csv", "timestamp": END.isoformat(), "scan_completed": True},
    ]

    def F(i, cat, text, status, src, excerpt, fresh="fresh", **kw):
        d = {"id": i, "category": cat, "text": text, "status": status, "source_id": src,
             "excerpt": excerpt, "freshness": fresh, "reviewer_signoff": False, "resolved": False}
        d.update(kw)
        return d

    findings = [
        F("F-01", "decision", "Use FastAPI for the backend", "Supported", "SRC-NOTE-01", "we agreed to go with FastAPI for speed", "aging"),
        F("F-02", "decision", "Use Razorpay as payment gateway", "Supported", "SRC-GH-01", "commit c0007: integrate razorpay checkout"),
        F("F-03", "decision", "Store sessions in Redis", "Needs review", "SRC-NOTE-02", "maybe redis for sessions? not sure", "stale"),
        F("F-04", "decision", "Use PostgreSQL as the primary database", "Conflicting", "SRC-NOTE-01", "primary DB will be PostgreSQL", "aging",
          conflicts_with="F-05"),
        F("F-05", "decision", "Use MongoDB as the primary database", "Conflicting", "SRC-NOTE-02", "we switched to MongoDB last sprint",
          conflicts_with="F-04"),
        F("F-06", "decision", "Why Redis caching was dropped", "Unknown", "SRC-NOTE-02", "(no explanation found in sources)", "stale"),
        F("F-07", "dependency", "Payments module depends on gateway sandbox keys held by Aarav", "Supported", "SRC-NOTE-02", "keys are with Aarav"),
        F("F-08", "dependency", "Frontend depends on /events API shape", "Supported", "SRC-GH-01", "frontend/src/Events.jsx fetches /api/events"),
        F("F-09", "blocker", "Reconciliation report blocked by missing sandbox keys", "Supported", "SRC-CSV-01", "T-04 blocker: waiting for gateway sandbox keys"),
        F("F-10", "task", "Webhook retry logic is half-implemented", "Supported", "SRC-GH-01", "TODO retry in webhook.py"),
    ]

    recipient = {"user_id": "u-incoming-01", "name": "Kabir Deshmukh", "role": "incoming", "scope": ["project", "tasks", "decisions"]}
    notes = {
        "meeting_2026-09-02.txt": "Kickoff notes. Primary DB will be PostgreSQL. Aarav owns payments. Contact aarav.k@college.edu or +91 98765 43210.",
        "meeting_2026-10-12.txt": "Sprint review. We switched to MongoDB last sprint. API key for sandbox: sk_test_FAKE1234567890abcdef (FAKE). Redis dropped, reason not noted.",
    }
    answer_key = {
        "expected_high_units": ["backend/payments"],
        "expected_medium_dormant_units": ["legacy/importer"],
        "expected_insufficient_units": ["scripts"],
        "expected_not_high_units": ["backend/auth", "frontend/src", "docs/guides"],
        "expected_bulk_edit_note_units": ["frontend/src"],
        "bot_must_be_ignored": BOT[0],
        "identity_merge": {"person": A, "aliases": [AARAV[1], AARAV_ALT[1]]},
        "unowned_open_tasks": ["T-07", "T-12", "T-19"],
        "blocked_without_blocker": ["T-14"],
        "departing_member_open_tasks": ["T-02", "T-03", "T-04", "T-05"],
        "initial_failing_rules": [2, 3, 4, 5],
        "initial_state": "Needs Attention",
        "planted_secrets": ["sk_test_FAKE1234567890abcdef", "+91 98765 43210", "aarav.k@college.edu"],
    }
    return {"commits": commits, "tasks": tasks, "sources": sources, "findings": findings,
            "recipient": recipient, "alias_map": ALIAS_MAP, "departing_member": A,
            "project_name": "Campus Events App (synthetic)", "raw_notes": notes, "answer_key": answer_key}


def demo_project(project_id="demo"):
    d = generate()
    return {"project_id": project_id, "name": d["project_name"], "departing_member": d["departing_member"],
            "alias_map": d["alias_map"], "sources": d["sources"], "commits": d["commits"], "tasks": d["tasks"],
            "findings": d["findings"], "recipient": d["recipient"], "approval": None, "versions": [], "receipts": []}


if __name__ == "__main__":
    out = os.path.dirname(os.path.abspath(__file__))
    d = generate()
    for key in ("commits", "tasks", "sources", "findings", "recipient", "answer_key"):
        with open(os.path.join(out, f"{key}.json"), "w") as fh:
            json.dump(d[key], fh, indent=2)
    for name, body in d["raw_notes"].items():
        with open(os.path.join(out, name), "w") as fh:
            fh.write(body)
    print(f"Wrote {len(d['commits'])} commits, {len(d['tasks'])} tasks, {len(d['findings'])} findings to {out}")
