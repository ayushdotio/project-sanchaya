"""Evidence-linked handover PDF (ReportLab). Built only from an approved version."""

from __future__ import annotations

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

NAVY = colors.HexColor("#1F3A5F")
LIGHT = colors.HexColor("#EAF1F7")
LINE = colors.HexColor("#C9D3DE")
base = ParagraphStyle("b", fontName="Helvetica", fontSize=9, leading=12)
small = ParagraphStyle("s", parent=base, fontSize=8, leading=10.5)
th = ParagraphStyle("th", parent=small, fontName="Helvetica-Bold", textColor=colors.white)
h1 = ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY)
h2 = ParagraphStyle(
    "h2",
    parent=base,
    fontName="Helvetica-Bold",
    fontSize=12,
    leading=15,
    textColor=NAVY,
    spaceBefore=10,
    spaceAfter=4,
)


def _t(rows, widths):
    data = [[Paragraph(escape(str(c)), th if i == 0 else small) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    st += [("BACKGROUND", (0, i), (-1, i), LIGHT) for i in range(2, len(rows), 2)]
    t.setStyle(TableStyle(st))
    return t


def _status_label(item: dict) -> str:
    status = str(item.get("status", "Unknown"))
    if item.get("reviewer_signoff") and status != "Supported":
        return f"{status} (reviewer sign-off)"
    return status


def generate_pdf(version: dict, target: str | io.BytesIO) -> str | io.BytesIO:
    """Render an approved handover version to a file path or in-memory ``BytesIO``."""
    c = version["content"]
    hdr = f"Handover v{version['version']} | hash {version['content_hash'][:16]}... | approved {version['created_at']}"

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.grey)
        canvas.drawString(15 * mm, 9 * mm, hdr)
        canvas.drawRightString(195 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    story = [
        Paragraph("Project Handover", h1),
        Spacer(1, 3),
        Paragraph(
            escape(f"{c.get('project') or '-'}  |  From: {c.get('departing_member') or '-'}  |  To: {c.get('recipient') or '-'}"),
            base,
        ),
        Spacer(1, 4),
    ]
    r = version["readiness"]
    story.append(
        Paragraph(
            f"<b>Readiness:</b> {escape(r['state'])} (all 7 checks passed). "
            f"<b>Version:</b> {version['version']}. <b>Full content hash:</b> {version['content_hash']}",
            small,
        )
    )
    sm = c["summary"]
    story.append(
        Paragraph(
            f"Summary: {sm['decisions']} decisions, {sm['open_tasks']} open tasks, {sm['dependencies']} dependencies, "
            f"{sm['known_problems']} known problems, {sm['risk_areas']} knowledge-risk areas, "
            f"{sm['open_gaps']} open gaps, {sm.get('gap_answers', 0)} self-reported answers.",
            small,
        )
    )

    story.append(Paragraph("1. Decisions and reasons", h2))
    decision_rows = [
        [d["id"], d["text"], _status_label(d), d["source_id"], d["excerpt"], d.get("freshness", "unknown")]
        for d in c.get("decisions", [])
    ] or [["-"] * 6]
    story.append(
        _t(
            [["ID", "Decision", "Status", "Source", "Evidence excerpt", "Freshness"]] + decision_rows,
            [12, 42, 24, 24, 48, 24],
        )
    )

    story.append(Paragraph("2. Open tasks", h2))
    task_rows = [
        [t["id"], t["title"], t["status"], t["owner"], t["blocker"] or "-"]
        for t in c.get("tasks", [])
    ] or [["-"] * 5]
    story.append(
        _t(
            [["ID", "Task", "Status", "Owner", "Blocker"]] + task_rows,
            [14, 52, 18, 40, 50],
        )
    )

    story.append(Paragraph("3. Dependencies and known problems", h2))
    dep_rows = [
        [d["id"], d["text"], "Dependency", _status_label(d), d["source_id"], d["excerpt"], d.get("freshness", "unknown")]
        for d in c.get("dependencies", [])
    ]
    dep_rows += [
        [d["id"], d["text"], "Known problem", _status_label(d), d["source_id"], d["excerpt"], d.get("freshness", "unknown")]
        for d in c.get("known_problems", [])
    ]
    if not dep_rows:
        dep_rows = [["-"] * 7]
    story.append(
        _t(
            [["ID", "Item", "Type", "Status", "Source", "Evidence excerpt", "Freshness"]] + dep_rows,
            [12, 44, 20, 22, 22, 34, 20],
        )
    )

    story.append(Paragraph("4. Knowledge-risk areas (potential, not a performance measure)", h2))
    risk_rows = [
        [
            x["unit"],
            x["level"],
            x["top_contributor"],
            f"{x['top_commit_share']:.0%}",
            x["total_changes"],
            "; ".join(x["notes"]) or "-",
        ]
        for x in c.get("risk_areas", [])
    ] or [["-"] * 6]
    story.append(
        _t(
            [["Module", "Level", "Main contributor", "Share of changes", "Total changes", "Notes"]] + risk_rows,
            [36, 16, 30, 22, 20, 50],
        )
    )

    hotspots = c.get("hotspot_files") or []
    task_risk = c.get("task_risk") or {}
    if hotspots or task_risk:
        hotspot_summary = ", ".join(f"{h['file']} ({h['level']}, {h['top_commit_share']:.0%})" for h in hotspots[:5]) or "None"
        single_contrib = ", ".join(task_risk.get("single_contributor_tasks") or []) or "None"
        story.append(Spacer(1, 3))
        story.append(
            Paragraph(
                escape(
                    f"File hotspots: {hotspot_summary}. "
                    f"Tasks with no second contributor: {single_contrib}."
                ),
                small,
            )
        )

    story.append(Paragraph("5. Open gaps, conflicts and uncertainties (disclosed)", h2))
    gap_rows = [
        [
            g["id"],
            g["text"],
            _status_label(g),
            g["source_id"],
            g.get("freshness", "unknown"),
            g.get("conflicts_with") or "-",
            "Yes" if g["resolved"] else "No",
        ]
        for g in c.get("open_gaps", [])
    ] or [["-"] * 7]
    story.append(
        _t(
            [["ID", "Item", "Status", "Source", "Freshness", "Conflicts with", "Resolved?"]] + gap_rows,
            [12, 54, 22, 24, 22, 22, 18],
        )
    )

    story.append(Paragraph("6. Prioritised next actions", h2))
    action_rows = [
        [a["priority"], a["action"], a["why"]]
        for a in c.get("next_actions", [])
    ] or [["-"] * 3]
    story.append(_t([["#", "Action", "Why"]] + action_rows, [10, 100, 64]))

    story.append(Paragraph("7. Self-reported gap answers (outgoing member)", h2))
    answer_rows = [
        [ga.get("question", ""), ga.get("answer", ""), ga.get("evidence_badge", "Self-reported")]
        for ga in c.get("gap_answers", [])
    ] or [["-"] * 3]
    story.append(_t([["Question", "Answer", "Badge"]] + answer_rows, [72, 74, 28]))

    story.append(Spacer(1, 6))
    story.append(Paragraph(escape(c["risk_disclaimer"]), small))

    doc = SimpleDocTemplate(
        target,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=f"Handover v{version['version']}",
        author="Sanchaya",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    if isinstance(target, io.BytesIO):
        target.seek(0)
    return target
