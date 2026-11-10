import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from data.synthetic.generate import demo_project, generate


@pytest.fixture
def data():
    return generate()


@pytest.fixture
def project():
    return demo_project("t")


@pytest.fixture
def ready_project(project):
    """Apply the fixes a leader would make so rules 1-6 pass."""
    for f in project["findings"]:
        if f["id"] == "F-03":
            f["reviewer_signoff"] = True
        if f["id"] in ("F-04", "F-05", "F-06"):
            f["resolved"] = True
    for t in project["tasks"]:
        if t["id"] in ("T-07", "T-12", "T-19"):
            t["owner_unknown"] = True
        if t["id"] == "T-14":
            t["reviewer_signoff"] = True
    return project
