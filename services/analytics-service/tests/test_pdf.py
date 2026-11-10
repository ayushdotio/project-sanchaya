import subprocess
import shutil
import pytest
from app.handover import assembly
from app.pdf.pdf_generator import generate_pdf


def test_pdf_has_hash_sources_and_labels(ready_project, tmp_path):
    v = assembly.approve(ready_project, "lead", "leader")
    path = generate_pdf(v, str(tmp_path / "h.pdf"))
    text = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout
    if shutil.which("pdftotext") is None:pytest.skip("pdftotext (poppler-utils) is not installed")
    text = subprocess.run(["pdftotext", "-layout", path, "-"],capture_output=True,text=True,check=True,).stdout
    assert v["content_hash"][:16] in text
    for needle in ("Handover v1", "SRC-NOTE-01", "Supported", "Conflicting", "Prioritised next actions", "performance"):
        assert needle in text
    # every decision shown has a source id
    for d in v["content"]["decisions"]:
        assert d["source_id"] in text
