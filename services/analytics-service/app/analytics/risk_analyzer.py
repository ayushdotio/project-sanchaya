"""Contribution Concentration Risk Analyzer (deterministic, no AI).

Input : normalised commit records and task records.
Output: ranked knowledge-risk areas with the raw numbers behind every flag.

Commit record: {sha, author, email, timestamp, files:[{path, additions, deletions}]}
Task record  : {id, title, assignee, status, blocker}
Wording is always "potential knowledge-risk area": never a performance score.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.common import parse_ts

DEFAULTS = {
    "window_days": 90,      # "recent" activity window
    "high_share": 0.70,     # top contributor share for High
    "medium_share": 0.50,   # top contributor share for Medium
    "min_changes": 5,       # below this -> Insufficient data
    "cover_target": 0.50,   # simplified bus-factor coverage target
    "lines_gap": 0.20,      # warn if commit share and line share disagree
    "unit_depth": 2,        # directory depth that defines a "module"
}
BOT_RE = re.compile(r"(\[bot\]|dependabot|renovate|github-actions)", re.I)
LEVEL_ORDER = {"High": 0, "Medium": 1, "Low": 2, "Insufficient data": 3}


def is_bot(name: str, email: str) -> bool:
    return bool(BOT_RE.search(name or "") or BOT_RE.search(email or ""))


def identity_key(name, email, alias_map):
    """Merge one person appearing under several names / emails."""
    alias_map = {k.lower(): v for k, v in (alias_map or {}).items()}
    email_l = (email or "").strip().lower()
    name_l = (name or "").strip().lower()
    if email_l in alias_map:
        return alias_map[email_l]
    if name_l in alias_map:
        return alias_map[name_l]
    return (name or email or "unknown").strip()


def unit_of(path: str, depth: int) -> str:
    parts = path.split("/")
    if len(parts) == 1:
        return "(root)"
    return "/".join(parts[: min(depth, len(parts) - 1)])


def _score(per_author, cfg, label_key, label):
    total = sum(a["commits"] for a in per_author.values())
    lines_total = sum(a["lines"] for a in per_author.values())
    recent_total = sum(a["recent"] for a in per_author.values())
    ranked = sorted(per_author.items(), key=lambda kv: (-kv[1]["commits"], -kv[1]["lines"], kv[0]))
    top_name, top = ranked[0]
    c_share = top["commits"] / total if total else 0.0
    l_share = top["lines"] / lines_total if lines_total else 0.0
    acc, cover = 0, 0
    for _, a in ranked:
        acc += a["commits"]
        cover += 1
        if acc >= cfg["cover_target"] * total:
            break
    notes = []
    if total < cfg["min_changes"]:
        level = "Insufficient data"
        notes.append(f"only {total} changes (minimum {cfg['min_changes']})")
    elif c_share >= cfg["high_share"]:
        if recent_total > 0:
            level = "High"
        else:
            level = "Medium"
            notes.append(f"dormant: no changes in the last {cfg['window_days']} days, High downgraded to Medium")
    elif c_share >= cfg["medium_share"]:
        level = "Medium"
    else:
        level = "Low"
    if total >= cfg["min_changes"] and abs(c_share - l_share) >= cfg["lines_gap"]:
        notes.append(f"commit share {c_share:.0%} and line share {l_share:.0%} disagree: check for bulk edits")
    recent_ranked = sorted(per_author.items(), key=lambda kv: (-kv[1]["recent"], kv[0]))
    recent_top = recent_ranked[0][0] if recent_total else None
    recent_share = (recent_ranked[0][1]["recent"] / recent_total) if recent_total else None
    return {
        label_key: label,
        "level": level,
        "top_contributor": top_name,
        "top_commit_share": round(c_share, 3),
        "top_line_share": round(l_share, 3),
        "total_changes": total,
        "recent_changes": recent_total,
        "recent_top_contributor": recent_top,
        "recent_top_share": round(recent_share, 3) if recent_share is not None else None,
        "contributors_to_cover_50pct": cover,
        "contributor_commits": {n: a["commits"] for n, a in ranked},
        "notes": notes,
        "wording": "potential knowledge-risk area" if level in ("High", "Medium") else "",
    }


def _group(commits, cfg, alias_map, keyfn, as_of):
    if as_of is None:
        return {}
    window_start = as_of - timedelta(days=cfg["window_days"])
    groups = defaultdict(lambda: defaultdict(lambda: {"commits": 0, "lines": 0, "recent": 0}))
    for c in commits:
        if is_bot(c.get("author", ""), c.get("email", "")):
            continue
        who = identity_key(c.get("author"), c.get("email"), alias_map)
        recent = parse_ts(c["timestamp"]) >= window_start
        per_key_lines = defaultdict(int)
        for f in c.get("files", []):
            for k in keyfn(f["path"]):
                per_key_lines[k] += f.get("additions", 0) + f.get("deletions", 0)
        for k, lines in per_key_lines.items():
            g = groups[k][who]
            g["commits"] += 1
            g["lines"] += lines
            g["recent"] += 1 if recent else 0
    return groups


def _task_contributors(task, alias_map):
    people = []
    if task.get("assignee"):
        people.append(identity_key(task["assignee"], "", alias_map))
    for extra in task.get("contributors") or []:
        if extra:
            k = identity_key(extra, "", alias_map)
            if k not in people:
                people.append(k)
    for field in ("second_contributor", "reviewer"):
        if task.get(field):
            k = identity_key(task[field], "", alias_map)
            if k not in people:
                people.append(k)
    return people


def _analyze_task_groups(tasks, cfg, alias_map):
    grouped = defaultdict(list)
    for t in tasks:
        group_name = (
            t.get("group")
            or t.get("module")
            or t.get("unit")
            or t.get("area")
            or t.get("category")
            or "general"
        )
        grouped[str(group_name)].append(t)

    results = []
    for group_name, group_tasks in grouped.items():
        total = len(group_tasks)
        open_or_blocked = [t for t in group_tasks if t.get("status") in ("open", "blocked")]
        counts = defaultdict(int)
        for t in group_tasks:
            if t.get("assignee"):
                counts[identity_key(t["assignee"], "", alias_map)] += 1
        assigned_total = sum(counts.values())
        if counts:
            ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
            top_owner, top_count = ranked[0]
            share = top_count / assigned_total if assigned_total else 0.0
        else:
            ranked = []
            top_owner, share = None, 0.0

        if total < 2 or assigned_total == 0:
            level = "Insufficient data"
        elif share >= cfg["high_share"]:
            level = "High"
        elif share >= cfg["medium_share"]:
            level = "Medium"
        else:
            level = "Low"

        results.append(
            {
                "task_group": group_name,
                "level": level,
                "top_contributor": top_owner,
                "top_task_share": round(share, 3),
                "total_tasks": total,
                "open_or_blocked": len(open_or_blocked),
                "contributor_tasks": {n: c for n, c in ranked},
                "wording": "potential knowledge-risk area" if level in ("High", "Medium") else "",
            }
        )

    results.sort(key=lambda r: (LEVEL_ORDER[r["level"]], -r["top_task_share"], -r["total_tasks"], r["task_group"]))
    return results


def analyze(commits, tasks=None, departing_member=None, alias_map=None, as_of=None, **overrides):
    cfg = {**DEFAULTS, **overrides}
    commits = list(commits or [])
    tasks = list(tasks or [])
    if as_of is None:
        as_of = max(
            (
                parse_ts(c["timestamp"])
                for c in commits
                if not is_bot(c.get("author", ""), c.get("email", ""))
            ),
            default=None,
        )
        # Fallback when commits only contain bot commits (prevents None - timedelta TypeError)
        if as_of is None and commits:
            as_of = max(
                (parse_ts(c["timestamp"]) for c in commits if c.get("timestamp")),
                default=datetime.now(timezone.utc),
            )
    else:
        as_of = parse_ts(as_of)

    units, hotspots, contributors = [], [], set()
    if commits:
        for c in commits:
            if not is_bot(c.get("author", ""), c.get("email", "")):
                contributors.add(identity_key(c.get("author"), c.get("email"), alias_map))
        ug = _group(commits, cfg, alias_map, lambda p: [unit_of(p, cfg["unit_depth"])], as_of)
        units = [_score(per, cfg, "unit", name) for name, per in ug.items()]
        fg = _group(commits, cfg, alias_map, lambda p: [p], as_of)
        all_files = [_score(per, cfg, "file", name) for name, per in fg.items()]
        hotspots = [h for h in all_files if h["level"] in ("High", "Medium")]
    order = lambda r: (LEVEL_ORDER[r["level"]], -r["top_commit_share"], -r["total_changes"])
    units.sort(key=order)
    hotspots.sort(key=order)

    departing = identity_key(departing_member, "", alias_map) if departing_member else None
    open_tasks = [t for t in tasks if t.get("status") in ("open", "blocked")]
    single_contributor_tasks = [
        t["id"]
        for t in open_tasks
        if len(_task_contributors(t, alias_map)) <= 1 and not t.get("reviewer_signoff")
    ]
    task_groups = _analyze_task_groups(tasks, cfg, alias_map)

    task_risk = {
        "open_or_blocked": len(open_tasks),
        "unowned": [t["id"] for t in open_tasks if not t.get("assignee")],
        "blocked_without_blocker": [t["id"] for t in tasks if t.get("status") == "blocked" and not t.get("blocker")],
        "departing_member_open_tasks": [
            t["id"] for t in open_tasks
            if departing and t.get("assignee") and identity_key(t["assignee"], "", alias_map) == departing
        ],
        "single_contributor_tasks": single_contributor_tasks,
    }
    departing_units = [
        u["unit"] for u in units
        if departing and u["top_contributor"] == departing and u["level"] in ("High", "Medium")
    ]
    return {
        "config": cfg,
        "as_of": as_of.isoformat() if as_of else None,
        "contributors": sorted(contributors),
        "departing_member": departing,
        "units": units,
        "hotspot_files": hotspots[:10],
        "total_hotspots": len(hotspots),
        "task_groups": task_groups,
        "task_risk": task_risk,
        "departing_member_risk_units": departing_units,
        "disclaimer": "Potential knowledge-risk areas only. Not a measure of individual performance.",
    }
