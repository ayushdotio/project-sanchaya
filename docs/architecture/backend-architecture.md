# Backend Architecture (`services/backend`)

## 1. Overview
The `services/backend` module serves as Sanchaya's primary API Gateway, Security Perimeter, and Stage 1 (Connect) Multi-Source Ingestion Engine. Built with Node.js, TypeScript, and Express.js, it mediates all traffic between the React frontend, MongoDB, and the internal Python microservices (`ai-engine` and `analytics-service`).

## 2. Directory Structure

```text
services/backend/
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    ├── config/
    │   ├── db.ts                 # Mongoose connection & connection pooling
    │   └── env.ts                # Zod runtime environment variable validation
    ├── middleware/
    │   ├── authMiddleware.ts     # Stateless JWT verification & 3-tier RBAC guards
    │   └── uploadMiddleware.ts   # Multer configuration, MIME & file-size filters
    ├── models/
    │   ├── User.ts               # User credentials, roles, password reset hashes
    │   ├── Project.ts            # Workspace metadata, member assignments, readiness state
    │   └── SourceRecord.ts       # Canonical ingested source documents (SRC-*)
    ├── routes/
    │   ├── auth.ts               # Register, login, profile, forgot/reset password
    │   ├── projects.ts           # Workspace creation & member management
    │   ├── uploads.ts            # Multipart notes (PDF/DOCX/TXT) & task (CSV) endpoints
    │   ├── github.ts             # Read-only GitHub PAT/OAuth sync triggers
    │   ├── findings.ts           # Candidate finding review, edit, approve/reject
    │   ├── gaps.ts               # Gap inspection & outgoing member Q&A submission
    │   ├── readiness.ts          # Risk map retrieval & leader checklist sign-off
    │   └── handover.ts           # Role-gated handover view, PDF proxy & receipt logs
    ├── services/
    │   ├── githubService.ts      # Octokit/Axios read-only commit, PR & issue fetcher
    │   ├── documentParser.ts     # pdf-parse, mammoth (DOCX) & TXT paragraph normalizer
    │   ├── taskParser.ts         # csv-parse streaming task tracker normalizer
    │   ├── secretScanner.ts      # Pre-AI regex secret & PII redaction engine
    │   └── pythonBridge.ts       # Internal HTTP client to ai-engine & analytics-service
    ├── types/
    │   ├── auth.types.ts         # Zod schemas & TS interfaces for JWT/RBAC
    │   └── source.types.ts       # Canonical interfaces for SourceRecord & findings
    └── server.ts                 # Express app initialization & middleware mounting