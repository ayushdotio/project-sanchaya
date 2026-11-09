# Development & Git Workflow

## 1. Four-Tier Branch Topology

Sanchaya enforces a strict 4-tier branching hierarchy to isolate domain development and prevent broken builds on `main` and `develop`:

```text
main (Tier 1: Production-ready, tested releases only)
 └── develop (Tier 2: Integration & Staging branch — All PRs target develop)
      ├── frontend          (Tier 3: Lokesh — services/frontend)
      │    └── frontend/<task-name>    (Tier 4: Local feature sub-branch)
      ├── backend           (Tier 3: Ayush — services/backend)
      │    └── backend/<task-name>     (Tier 4: Local feature sub-branch)
      ├── ai-engine         (Tier 3: Varad/Firoz — services/ai-engine)
      │    └── ai-engine/<task-name>   (Tier 4: Local feature sub-branch)
      └── analytics         (Tier 3: Prakhar — services/analytics-service)
           └── analytics/<task-name>   (Tier 4: Local feature sub-branch)
```

### Golden Rules
- **Never** commit or open a Pull Request directly to `main`.
- **Always** pull integration updates from `origin/develop`.
- Do daily work inside a Tier 4 sub-branch (`<domain>/<feature>`), merge into your Tier 3 domain branch, and open a Pull Request from your domain branch into `develop`.

---

## 2. Local Environment Setup

```bash
# 1. Clone the repository
git clone https://github.com/ayushdotio/Sanchaya.git
cd Sanchaya

# 2. Fetch all remote branches and checkout your domain branch
git fetch --all
git checkout -b <your-domain-branch> origin/<your-domain-branch>

# 3. Configure root environment variables
cp .env.example .env

# 4. Build and start all services via Docker Compose
docker compose up -d --build
```

### MongoDB Connection URI Rules in `.env`
- **Backend in Docker + Mongo in Docker:**  
  `MONGO_URI=mongodb://mongo:27017/sanchaya`
- **Backend in Docker + Mongo on Host OS:**  
  `MONGO_URI=mongodb://host.docker.internal:27017/sanchaya`
- **Backend on Host OS (`npm run dev`) + Mongo on Host OS:**  
  `MONGO_URI=mongodb://127.0.0.1:27017/sanchaya`

---

## 3. Daily Feature Development Lifecycle

### Step 1: Sync Your Domain Branch with `develop`
Before starting any new task, pull the latest integrated team code from `develop`:

```bash
git checkout backend          # Replace with frontend | ai-engine | analytics
git pull origin develop
```

### Step 2: Create a Task Sub-Branch
```bash
git checkout -b backend/jwt-auth
```

### Step 3: Stage Changes & Commit Atomically
Inspect your changes before staging to ensure no `.env` files or build artifacts are included:

```bash
git status
git diff
git add services/backend/src/routes/auth.ts
git commit -m "feat(backend): implement stateless JWT login and RBAC middleware"
```

#### Conventional Commit Prefixes:
- `feat(<scope>)`: New feature or endpoint
- `fix(<scope>)`: Bug fix or edge-case patch
- `security(<scope>)`: Redaction rules, RBAC guards, or validation hardening
- `docs(<scope>)`: Documentation updates in `docs/`
- `refactor(<scope>)`: Code restructuring without behavior change
- `test(<scope>)`: Unit, integration, or Metric 5 verification tests

### Step 4: Merge Sub-Branch into Your Domain Branch & Sync `develop`
```bash
git checkout backend
git pull origin develop       # Ensure no new upstream conflicts
git merge backend/jwt-auth
git push origin backend
```

### Step 5: Raise a Pull Request to `develop`
1. Open GitHub and create a Pull Request with `base: develop` and `compare: <your-domain-branch>`.
2. Verify that `docker compose up --build` succeeds and all service `/health` checks pass.
3. After review and approval, merge into `develop`.
4. Only after full end-to-end team verification on `develop` is `develop` promoted into `main`.
