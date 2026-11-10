"""Evidence-linked handover PDF (ReportLab). Built only from an approved version."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from xml.sax.saxutils import escape

NAVY = colors.HexColor("#1F3A5F"); LIGHT = colors.HexColor("#EAF1F7"); LINE = colors.HexColor("#C9D3DE")
base = ParagraphStyle("b", fontName="Helvetica", fontSize=9, leading=12)
small = ParagraphStyle("s", parent=base, fontSize=8, leading=10.5)
th = ParagraphStyle("th", parent=small, fontName="Helvetica-Bold", textColor=colors.white)
h1 = ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY)
h2 = ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=NAVY, spaceBefore=10, spaceAfter=4)


def _t(rows, widths):
    data = [[Paragraph(escape(str(c)), th if i == 0 else small) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1)
    st = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    st += [("BACKGROUND", (0, i), (-1, i), LIGHT) for i in range(2, len(rows), 2)]
    t.setStyle(TableStyle(st))
    return t


def generate_pdf(version: dict, path: str) -> str:
    c = version["content"]
    hdr = f"Handover v{version['version']} | hash {version['content_hash'][:16]}... | approved {version['created_at']}"

    def footer(canvas, doc):
        canvas.saveState(); canvas.setFont("Helvetica", 7.5); canvas.setFillColor(colors.grey)
        canvas.drawString(15 * mm, 9 * mm, hdr)
        canvas.drawRightString(195 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    S = [Paragraph("Project Handover", h1), Spacer(1, 3),
         Paragraph(escape(f"{c['project']}  |  From: {c['departing_member']}  |  To: {c['recipient']}"), base), Spacer(1, 4)]
    r = version["readiness"]
    S.append(Paragraph(f"<b>Readiness:</b> {escape(r['state'])} (all 7 checks passed). "
                       f"<b>Version:</b> {version['version']}. <b>Full content hash:</b> {version['content_hash']}", small))
    sm = c["summary"]
    S.append(Paragraph(f"Summary: {sm['decisions']} decisions, {sm['open_tasks']} open tasks, {sm['dependencies']} dependencies, "
                       f"{sm['known_problems']} known problems, {sm['risk_areas']} knowledge-risk areas, {sm['open_gaps']} open gaps.", small))

    S.append(Paragraph("1. Decisions and reasons", h2))
    S.append(_t([["ID", "Decision", "Status", "Source", "Evidence excerpt", "Freshness"]] +
                [[d["id"], d["text"], d["status"] + (" (reviewer sign-off)" if d["reviewer_signoff"] and d["status"] != "Supported" else ""),
                  d["source_id"], d["excerpt"], d["freshness"]] for d in c["decisions"]] or [["-"] * 6],
               [12, 42, 24, 24, 48, 24]))
    S.append(Paragraph("2. Open tasks", h2))
    S.append(_t([["ID", "Task", "Status", "Owner", "Blocker"]] +
                [[t["id"], t["title"], t["status"], t["owner"], t["blocker"] or "-"] for t in c["tasks"]], [14, 52, 18, 40, 50]))
    S.append(Paragraph("3. Dependencies and known problems", h2))
    rows = [["ID", "Item", "Type", "Source", "Evidence excerpt"]]
    rows += [[d["id"], d["text"], "Dependency", d["source_id"], d["excerpt"]] for d in c["dependencies"]]
    rows += [[d["id"], d["text"], "Known problem", d["source_id"], d["excerpt"]] for d in c["known_problems"]]
    S.append(_t(rows, [13, 62, 24, 26, 49]))
    S.append(Paragraph("4. Knowledge-risk areas (potential, not a performance measure)", h2))
    S.append(_t([["Module", "Level", "Main contributor", "Share of changes", "Total changes", "Notes"]] +
                [[x["unit"], x["level"], x["top_contributor"], f"{x['top_commit_share']:.0%}", x["total_changes"], "; ".join(x["notes"]) or "-"]
                 for x in c["risk_areas"]], [36, 16, 30, 22, 20, 50]))
    S.append(Paragraph("5. Open gaps, conflicts and uncertainties (disclosed)", h2))
    S.append(_t([["ID", "Item", "Status", "Source", "Resolved?"]] +
                [[g["id"], g["text"], g["status"], g["source_id"], "Yes" if g["resolved"] else "No"] for g in c["open_gaps"]] or [["-"] * 5],
               [13, 80, 24, 30, 27]))
    S.append(Paragraph("6. Prioritised next actions", h2))
    S.append(_t([["#", "Action", "Why"]] + [[a["priority"], a["action"], a["why"]] for a in c["next_actions"]], [10, 100, 64]))
    S.append(Spacer(1, 6))
    S.append(Paragraph(escape(c["risk_disclaimer"]), small))
    SimpleDocTemplate(path, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                      title=f"Handover v{version['version']}", author="Sanchaya").build(S, onFirstPage=footer, onLaterPages=footer)
    return path
