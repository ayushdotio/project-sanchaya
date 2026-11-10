"""End-to-end demo of Prakhar's modules on the synthetic project. Run: python run_demo.py"""
import os

from app.handover import assembly
from app.pdf.pdf_generator import generate_pdf
from app.readiness.engine import evaluate
from data.synthetic.generate import demo_project

p = demo_project("demo")
print("== RISK MAP ==")
rm = assembly.risk_map(p)
for u in rm["units"]:
    print(f"  {u['level']:<18} {u['unit']:<18} top={u['top_contributor']:<15} share={u['top_commit_share']:.0%} changes={u['total_changes']} {'; '.join(u['notes'])}")
print("  departing member's risk units:", rm["departing_member_risk_units"])

print("\n== READINESS (initial) ==")
r = evaluate(p)
print(" ", r["state"], "failing rules:", r["failing_rules"])
for rule in r["rules"]:
    print(f"  [{'PASS' if rule['passed'] else 'FAIL'}] {rule['id']}. {rule['name']}")
    for reason in rule["reasons"]:
        print("        -", reason)

print("\n== LEADER FIXES THE GAPS ==")
for f in p["findings"]:
    if f["id"] == "F-03": f["reviewer_signoff"] = True
    if f["id"] in ("F-04", "F-05", "F-06"): f["resolved"] = True
for t in p["tasks"]:
    if t["id"] in ("T-07", "T-12", "T-19"): t["owner_unknown"] = True
    if t["id"] == "T-14": t["reviewer_signoff"] = True
print(" ", evaluate(p)["state"])

print("\n== APPROVE -> VERSION 1 ==")
v = assembly.approve(p, "lead-1", "leader")
print("  version", v["version"], "content_hash", v["content_hash"])
print("  state:", evaluate(p)["state"])
h = assembly.get_handover(p, "incoming", "u-incoming-01")
print("  incoming member sees:", h["content"]["summary"])
print("  receipt:", assembly.acknowledge(p, 1, "u-incoming-01"))

os.makedirs("out", exist_ok=True)
print("  PDF ->", generate_pdf(v, "out/handover_v1.pdf"))

print("\n== TAMPER AFTER APPROVAL ==")
p["findings"][0]["text"] = "Use Django for the backend"
print("  state:", evaluate(p)["state"], "| failing:", evaluate(p)["failing_rules"])
try:
    assembly.get_handover(p, "incoming", "u-incoming-01")
except assembly.AccessDenied as e:
    print("  incoming access blocked:", e)
