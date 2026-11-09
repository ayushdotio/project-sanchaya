# Sanchaya (सञ्चय)

> **Preserving Knowledge. Connecting People. Continuing Projects.**

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![React](https://img.shields.io/badge/Frontend-React_19_+_Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![NodeJS](https://img.shields.io/badge/Backend-Node.js_+_TypeScript-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/AI_%26_Analytics-Python_3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB_7.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)

**CodeFrontier Hackathon — Round 1 & 2**  
**Institution:** Nutan Maharashtra Institute of Engineering and Technology (NMIET), Pune  
**Team:** Epsilum  

---

## 📌 Problem Overview

When a software developer departs a team or project, critical institutional knowledge departs with them:
- Why specific architectural or technology choices were made.
- Which features remain unfinished, blocked, or in-flight.
- Which complex bugs remain unresolved and their history.
- What decisions and tradeoffs were agreed upon in ad-hoc meetings.
- What the departing member planned to execute next.

Studies show that **65% of popular open-source projects have a "truck factor" of 2 or less** (Avelino et al., 2016). When a core contributor leaves, onboarding new developers often stalls due to missing context, outdated wikis, and unrecorded tacit knowledge.

### Why Existing Solutions Fail
- **Static Documentation & READMEs:** Record what code currently exists, not *why* it was built or *what* is blocked. They quickly rot and go stale.
- **Generic AI Summarizers:** Hallucinate ungrounded explanations, sound confident while inventing facts, and hide critical missing context.
- **Uncontrolled Exposure:** Sensitive API keys, credentials, or private discussion snippets are accidentally leaked during unstructured onboarding handovers.

---

## 💡 The Sanchaya Solution

**Sanchaya (सञ्चय)** is an **evidence-backed project knowledge handover platform**. When a member departs, Sanchaya reconstructs the project’s current state from authorized technical sources (GitHub activity, meeting notes, and task records) to generate a verified, role-appropriate, and actionable continuation plan for the incoming member.

### Core Architectural Principle
> **AI is used strictly for candidate extraction and question phrasing.**  
> Evidence verification, freshness tracking, readiness evaluation, secret redaction, access control, and approval state transitions are enforced by **deterministic backend code**—never trusted blindly to an LLM.

---

## 🌟 5 Key Innovations

1. **Evidence-First AI & Freshness Monitoring:** Every extracted claim is bound to a verified `source_id` with a verbatim excerpt. Creation and update timestamps are tracked; older or potentially contradicted evidence receives an automated *"Re-check Recommended"* badge.
2. **Knowledge Gap Radar & Gap-to-Question Loop:** The system explicitly detects what existing sources *fail* to establish and generates targeted micro-questions for the departing contributor. Their responses are stored and labeled distinctly as *Self-Reported Evidence*.
3. **Contribution Concentration Risk Map:** A reproducible, rule-based Git history and task concentration analysis that identifies potential knowledge silos and "bus factor" modules without subjective AI bias.
4. **7-Point Handover Readiness Checklist:** A transparent, rule-based gatekeeper that evaluates completeness across sources, evidence, task ownership, blockers, conflicts, permissions, and team leader sign-off before any handover is shared.
5. **Actionable Handover & Role-Scoped Redaction:** Delivers a structured, prioritized next-step action plan and generates downloadable, citation-linked handover PDFs.

---

## 🔄 The 5-Stage Product Workflow

```text
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Stage 1:        │     │ Stage 2:         │     │ Stage 3:         │     │ Stage 4:         │     │ Stage 5:        │
│ CONNECT         │ ──> │ RECONSTRUCT      │ ──> │ VERIFY           │ ──> │ REVIEW           │ ──> │ HANDOVER        │
│ Multi-Source    │     │ AI State & Risk  │     │ 4-State Evidence │     │ 7-Point Ready    │     │ Role-Scoped UI  │
│ Ingestion +     │     │ Extraction (JSON │     │ Validator +      │     │ Checklist + Gap  │     │ & PDF Export    │
│ PII Masking     │     │ Schema)          │     │ Freshness Alerts │     │ Question Loop    │     │                 │
└─────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘     └─────────────────┘
```

### Stage 1: Connect
- Ingests **GitHub REST API** data (commits, PRs, issues), **Meeting Notes** (PDF, DOCX, TXT), and **Task Trackers** (CSV).
- Normalizes every record with a unique identifier (e.g., `SRC-GH-014`, `SRC-DOC-003`) and timestamp metadata.
- Executes a **deterministic regex secret and PII scanner** to mask API keys, tokens, and sensitive credentials *before* data reaches any AI model.

### Stage 2: Reconstruct
- LLM extracts chronological decisions, active task statuses, owners, dependencies, blockers, and open questions via strict JSON schemas.
- In parallel, rule-based commit and task distribution analysis computes the **Contribution Concentration Risk Map**.

### Stage 3: Verify
Every candidate claim is verified against MongoDB source records and categorized into one of four deterministic states:

| Status | Meaning | Deterministic Rule |
| :--- | :--- | :--- |
| **`Supported`** | Evidence directly backs the claim | `source_id` exists and quoted excerpt substring exactly matches the stored record |
| **`Needs review`**| Evidence is incomplete or ambiguous | Partial match, single informal note, or missing task owner/deadline |
| **`Conflicting`** | Sources disagree | Newer commit/task status contradicts an earlier meeting decision |
| **`Unknown`** | Available sources do not answer it | No supporting excerpt found; routed to the **Gap-to-Question Loop** |

### Stage 4: Review & Handover Readiness Checklist
The Team Leader evaluates a 7-point checklist:
1. Imported sources verified
2. Technical decisions backed by evidence
3. Unfinished tasks owned or marked unknown
4. Blockers and dependencies identified
5. Conflicts and uncertainties disclosed
6. Recipient permissions checked
7. Team leader approval recorded

Status evaluates to: `Needs Attention`, `Ready for Review`, or `Approved for Sharing`. Unresolved gaps trigger targeted exit questions for the departing developer.

### Stage 5: Handover
The incoming contributor receives a role-scoped, interactive dashboard featuring:
- Executive project status and architectural rationale timeline.
- Pending tasks, blockers, and knowledge-risk hotspots.
- Clickable citation links for every finding with freshness badges.
- Downloadable, citation-linked handover PDF report generated via ReportLab.

---

## 🏛️ System Architecture & Services

Sanchaya is architected as an orchestrated set of microservices communicating over an internal Docker network:

```
                      ┌────────────────────────────────────────┐
                      │          React 19 + Vite               │
                      │     (services/frontend: 5173)          │
                      └──────────────────┬─────────────────────┘
                                         │  HTTP / REST
                                         ▼
                      ┌────────────────────────────────────────┐
                      │    Node.js / Express API Gateway       │
                      │      (services/backend: 5000)          │
                      └───────┬──────────────┬───────────────┬─┘
                              │              │               │
        Internal Docker Net   │              │               │
        ┌─────────────────────┼──────────────┼───────────────┼────────────────────┐
        │                     ▼              ▼               ▼                    │
        │             ┌──────────────┐┌──────────────┐┌───────────────────────┐   │
        │             │ MongoDB 7.0  ││  AI Engine   ││   Analytics Service   │   │
        │             │  (Port 27017)││ (Port 8001)  ││      (Port 8002)      │   │
        │             └──────────────┘└──────────────┘└───────────────────────┘   │
        └─────────────────────────────────────────────────────────────────────────┘
```

| Service | Path | Tech Stack | Port | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **`frontend`** | `services/frontend` | React 19, Vite, Tailwind CSS | `5173` | Role-aware dashboards (Leader, Outgoing, Incoming), findings review, risk & gap visualizations |
| **`backend`** | `services/backend` | Node.js 20, TypeScript, Express | `5000` | Gateway, JWT Auth, GitHub connector, document parsers, pre-AI secret scanner |
| **`ai-engine`** | `services/ai-engine` | Python 3.11, FastAPI / Uvicorn | `8001` | LLM candidate extraction, JSON schema validation, gap detection & question generation |
| **`analytics-service`** | `services/analytics-service` | Python 3.11, FastAPI / Uvicorn | `8002` | Git contribution risk metrics, 7-point readiness engine, ReportLab PDF generation |
| **`mongo`** | Database Container | MongoDB 7.0 | `27017` | Persistent document storage for raw sources, normalized chunks, and findings |

---

## 🔒 Security, Privacy & Compliance

- **Pre-AI Redaction:** Deterministic regex scans mask API keys, tokens, passwords, and personal identifiers prior to passing prompts to LLMs.
- **Read-Only Ingestion:** GitHub repository access is strictly read-only; no write-back permissions are requested.
- **Access Control:** Role-Based Access Control (RBAC) ensures unapproved findings or items failing the readiness checklist are never exposed to incoming members.
- **Network Isolation:** MongoDB is bound to `127.0.0.1` locally, preventing unintended exposure across public host interfaces.

---

## 🚀 Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose
- [Node.js](https://nodejs.org/) (v20+) *(optional, for standalone local development)*
- [Python](https://www.python.org/) (v3.11+) *(optional, for standalone local development)*

### 1. Clone the Repository
```bash
git clone https://github.com/ayushdotio/Sanchaya.git
cd Sanchaya
```

### 2. Configure Environment Variables
Copy the sample environment file:
```bash
cp .env.example .env
```
*(Update `.env` with your desired secrets, MongoDB credentials, and optional GitHub Personal Access Token).*

### 3. Run with Docker Compose (Recommended)
Build and spin up the complete microservices stack:
```bash
docker compose up --build
```

### 4. Access the Application
- **Frontend Dashboard:** [http://localhost:5173](http://localhost:5173)
- **Backend Healthcheck:** [http://localhost:5000/health](http://localhost:5000/health)
- **AI Engine Service:** [http://localhost:8001](http://localhost:8001)
- **Analytics Service:** [http://localhost:8002](http://localhost:8002)

---

## 👥 Team Epsilum & Individual Contributions

| Member | Role | Technical Focus & Responsibilities |
| :--- | :--- | :--- |
| **Lokesh Pravin Pawar** *(Group Leader)* | Frontend Lead | Full React + Tailwind CSS web application, UI/UX workflow, role-aware dashboard screens, findings review UI, readiness checklist panel, and frontend–backend integration. |
| **Ayush Nirmal** | Backend & Security Lead | Backend API gateway foundation, JWT role-based access control, GitHub REST connector, multi-source ingestion parsers (PDF, DOCX, CSV), and pre-AI regex secret/PII redaction pipeline. |
| **Varad Gaikwad** | AI & Validation Lead | LLM structured JSON schema extraction, deterministic 4-state evidence validator, temporal conflict detection, freshness monitoring, and Gap-to-Question generation loop. |
| **Prakhar Raj** | Analytics & Export Lead | Rule-based Git history Contribution Concentration Risk Analyzer, 7-point Handover Readiness Checklist engine, ReportLab PDF export pipeline, and evaluation dataset. |

---

## 🗺️ Development Roadmap

- [x] **Round 1 (The Plan):** Architectural proposal, 5-stage workflow design, deterministic validation rules, readiness checklist schema, and team allocation.
- [ ] **Round 2 (The Build):** End-to-end working MVP with multi-source ingestion, secret redaction, AI extraction, 4-state validation, interactive dashboard, and PDF export.
- [ ] **Round 3 (The Polish):** Usability testing with NMIET student teams, full Gap-to-Question loop with self-reported badges, and audit version history with receipt acknowledgement.

---

## 📚 References
1. **Avelino, G., Passos, L., Hora, A., & Valente, M. T. (2016).** *A novel approach for estimating Truck Factors.* Proceedings of the 24th IEEE International Conference on Program Comprehension (ICPC), pp. 1–10.
2. **Robillard, M. P. (2021).** *Turnover-Induced Knowledge Loss in Practice.* ESEC/FSE 2021: Proceedings of the 29th ACM Joint European Software Engineering Conference and Symposium on the Foundations of Software Engineering.
3. **Steinmacher, I., Silva, M. A. G., Gerosa, M. A., & Redmiles, D. F. (2015).** *A systematic literature review on the barriers faced by newcomers to open source software projects.* Information and Software Technology, 59, 67–85.

---

<p align="center">
  <b>Built with ❤️ by Team Epsilum for CodeFrontier</b>
</p>
