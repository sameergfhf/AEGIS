# AEGIS — API Sentinel

**AEGIS** is an enterprise-grade, full-stack API security scanner, behavior visualizer, and posture management platform. It executes observable, non-destructive security probes against target HTTP APIs, calculates evidence-based Security Assessment Scores (0–100), visualizes real-time request lifecycles through interactive diagrams, and facilitates multi-tenant team collaboration.

---

## Key Capabilities

| Feature Category | Capabilities |
|---|---|
| **Security Probes** | HTTPS/TLS certificate verification, context-aware HTTP security headers, sensitive token and secret leakage detection, and domain/redirect reputation checks (VirusTotal & Google Safe Browsing). |
| **Evidence-Based Scoring** | 0–100 Security Assessment Score with assessment coverage indicators, excluding inconclusive tests from penalization. |
| **Interactive Telemetry** | Multi-sample latency line charts, severity distribution breakdowns, and interactive React Flow request lifecycle diagrams. |
| **Request Inspector** | Sanitized inspection of request headers, bodies, response payloads, and redirect chains with automated secret redaction. |
| **OpenAPI 3.0 Analyzer** | Automated endpoint discovery from JSON/YAML specifications with single-operation probe execution wizards. |
| **Multi-Tenancy & Teams** | Supabase-powered team workspaces, member invitation flows, role-based access control (Owner, Admin, Member), and scoped audit logs. |
| **Dual Persistence** | Real-time local SQLite database for development, paired with asynchronous cloud sync to Supabase Database & Storage. |
| **SSRF Defense** | Multi-layer IP resolution validation blocking loopback, private RFC1918, link-local, multicast, and cloud metadata addresses. |
| **Executive Reports** | Downloadable security audit reports generated via ReportLab in PDF format. |

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Recharts, React Flow, React Router v7 |
| **Design System** | Aegis Cyber Intelligence System (`frontend/src/components/ui/`, dark glassmorphism) |
| **Backend** | Python 3.12, FastAPI, HTTPX (async client), SQLAlchemy 2.0 (async), aiosqlite |
| **Database** | SQLite 3 (`api_sentinel.db`) with async engine; PostgreSQL-ready via `DATABASE_URL` |
| **Cloud & Auth** | Supabase Auth (JWT), Supabase Database (PostgreSQL), and Supabase Storage |
| **PDF Engine** | ReportLab |
| **Testing** | Pytest + pytest-asyncio (Backend), Vitest (Frontend) |
| **Linting** | Oxlint (Frontend) |
| **Containerization** | Docker, Docker Compose, Nginx (Alpine) |

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- (Optional) VirusTotal API key for threat intelligence

### 1. Workspace Monorepo Setup (Fastest)

AEGIS includes a root-level workspace `package.json` that coordinates tasks across the repository:

```bash
# 1. Clone repository
git clone https://github.com/your-org/aegis.git
cd aegis

# 2. Configure environment files
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Setup and start Backend
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In a second terminal:
```bash
# 4. Start Frontend
cd frontend
npm install --legacy-peer-deps
npm run dev
```

- **Frontend Application:** `http://localhost:3000`
- **Backend API:** `http://localhost:8000`
- **Interactive OpenAPI Documentation:** `http://localhost:8000/docs`

---

## Full-Stack Docker Deployment

Launch both backend and frontend containers with a single command:

```bash
# Build and run containers
docker-compose up --build

# Application available at http://localhost
```

---

## Testing & Quality Assurance

Run the automated test suites:

```bash
# Run Backend Pytest suite (75 passing tests)
cd backend
venv\Scripts\activate
pytest

# Run Frontend Vitest suite
cd frontend
npm test

# Run Frontend Type-Check & Production Build
cd frontend
npm run build

# Run Fast Frontend Linter
npm run lint
```

Or from the workspace root:
```bash
npm run test
npm run build
npm run lint
```

---

## Project Structure

For complete architectural details, consult [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md).

```
AEGIS/
├── docker-compose.yml               # Container orchestration
├── package.json                     # Workspace script coordinator
├── README.md                        # Master project documentation
├── docs/
│   └── PROJECT_STRUCTURE.md         # Directory map, workflows & request tracing
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application entry point
│   │   ├── config.py                # Pydantic Settings
│   │   ├── database.py              # Async SQLAlchemy engine
│   │   ├── schemas.py               # Request/Response schemas
│   │   ├── api/                     # REST routes & Auth extraction
│   │   ├── models/                  # SQLAlchemy ORM models (Scan, Finding)
│   │   ├── scanners/                # Security checkers (TLS, Headers, Leakage, VT)
│   │   ├── security/                # SSRF validation & Secret redaction
│   │   └── services/                # Scan, Scoring, Visualization, PDF & Supabase sync
│   └── tests/                       # Automated backend test suite
│
└── frontend/
    ├── src/
    │   ├── components/ui/           # Aegis primitive components (Button, Badge, Card, Modal)
    │   ├── components/              # Domain components (Layout, ScoreCard, FlowDiagram)
    │   ├── contexts/                # AuthContext & WorkspaceContext
    │   ├── hooks/                   # useScan custom hook
    │   ├── pages/                   # 10 Application pages
    │   ├── services/                # Axios API client & Supabase sync service
    │   ├── types/                   # TypeScript interfaces
    │   └── __tests__/               # Frontend unit test suites
    └── vite.config.ts               # Vite configuration (port 3000, proxy to 8000)
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend health, database connectivity, and scanner integration status |
| `POST` | `/api/scans` | Submit a target URL for automated probe scanning (returns 202 Accepted) |
| `POST` | `/api/scans/operation` | Execute a targeted probe against a specific OpenAPI endpoint |
| `GET` | `/api/scans/{scan_id}` | Poll scan status, duration, score, and summary metrics |
| `GET` | `/api/scans/{scan_id}/findings` | Retrieve all security findings with remediation guidance |
| `GET` | `/api/scans/{scan_id}/visualizations` | Retrieve latency points, severity counts, and React Flow nodes/edges |
| `GET` | `/api/scans/{scan_id}/report` | Download executive PDF audit report |
| `POST` | `/api/scans/{scan_id}/compare` | Compare security posture between two scans with delta findings |
| `GET` | `/api/scans/history` | List scan history scoped by user or team workspace |
| `POST` | `/api/specifications/analyze` | Parse and inspect an OpenAPI 3.0 specification from URL or file upload |

---

## Scoring Methodology

The **Security Assessment Score** (0–100) measures observable security posture:

$$\text{Assessment Score} = \left( \frac{\text{Earned Points}}{\text{Assessed Points}} \right) \times 100$$

| Test Domain | Max Points | Evaluation Scope |
|---|---|---|
| **HTTPS and TLS Security** | 30 | Scheme enforcement, certificate trust chain, hostname matching, validity expiration |
| **HTTP Security Headers** | 20 | HSTS, CSP, X-Frame-Options, X-Content-Type-Options (context-aware for JSON vs HTML) |
| **Information Leakage** | 25 | Deductive model checking response body and headers for exposed keys, stack traces, private IPs |
| **Domain Reputation** | 25 | VirusTotal and Google Safe Browsing threat analysis (marked inconclusive if unconfigured) |

**Assessment Coverage** is calculated as:
$$\text{Assessment Coverage} = \frac{\text{Assessed Points}}{100} \times 100\%$$

Inconclusive checks are removed from the denominator rather than penalizing the score.

---

## Multi-Layer SSRF Defense

AEGIS enforces strict defenses against Server-Side Request Forgery:
1. **Scheme Whitelist:** Only `http://` and `https://` protocols are permitted.
2. **IP & Subnet Blocking:** DNS resolution is performed before requests; loopback (`127.0.0.0/8`, `::1`), private RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), multicast, and cloud metadata (`169.254.169.254`) addresses are blocked.
3. **Credential Stripping:** Embedded user credentials in URLs (`http://user:pass@host`) are rejected.
4. **Redirect Destination Checking:** Redirects are not followed blindly; every hop is re-validated against the SSRF filter.
5. **Bounded Execution:** Maximum response size is capped at 512 KB, and timeout limits (15s default) prevent hung sockets.

## Hybrid API Alternative Discovery

Alternative recommendations combine AEGIS's existing curated provider catalogue with public metadata from the APIs.guru OpenAPI directory (`https://api.apis.guru/v2/list.json` and its provider index). Live lookup happens when a user opens or manually refreshes the recommendation workspace; it does not delay the original security assessment. If the directory is unavailable or malformed, AEGIS returns the local catalogue and a notice. If neither source has category matches, the response explains that no alternatives were found.

The directory contributes provider/API names, descriptions, documentation links and OpenAPI specification URLs when present. Its metadata is unverified: AEGIS does not infer API endpoints, pricing, authentication, compatibility, activity or security from a directory listing. Unverified entries cannot be scanned until a safe endpoint is verified separately. Relevance is a similarity ranking, not a security score; security score and coverage appear only after a user explicitly starts a read-only assessment of a verified endpoint.

The full directory is cached for `API_DISCOVERY_DIRECTORY_TTL` seconds (default 86400 / 24 hours); category results use `API_DISCOVERY_CATEGORY_TTL` (default 10800 / 3 hours). Both values have a 60-second minimum. The Refresh action bypasses category and directory caches. Recommendation snapshots are stored in the existing scan `result_json` under `alternatives`; the existing `alternative_scans` data is preserved. No credentials are used or stored.

External requests are restricted to the fixed HTTPS APIs.guru host, validated with the central URL/IP checks, connected to the exact validated public IP to limit DNS rebinding, kept under normal TLS certificate verification, and do not follow redirects. Requests have strict timeouts and response-size limits. External JSON is treated as untrusted metadata and only HTTPS links without embedded credentials are rendered as links.

## Supabase workspace schema

The inspected state, current persistence boundaries, and security foundation for the enterprise workspace work are documented in `docs/ENTERPRISE_WORKSPACE_ARCHITECTURE.md`.

Workspace features use the frontend's configured Supabase project. Apply `backend/migrations/20261117_workspace_base_schema.sql`, `backend/migrations/20261118_workspace_projects_inventory.sql`, and `backend/migrations/20261118_workspace_inventory_integrity.sql` to that exact project using the Supabase SQL Editor or a linked Supabase migration workflow. These migrations establish workspace roles and RLS, the authenticated workspace-creation RPC, projects, and the API inventory. The backend's `SUPABASE_AUTH_URL` and `SUPABASE_AUTH_ANON_KEY` must match the frontend project so API JWT verification and membership checks use the same Auth issuer. The backend's separate `SUPABASE_URL` still controls its scan-sync path; that scan persistence split is documented in `docs/ENTERPRISE_WORKSPACE_ARCHITECTURE.md`. Never put the service-role key in frontend configuration.

Workspace invitations are rows in `workspace_members` with `status = 'invited'`; there is no separate invitations table in the current application. Workspace projects and API inventory have no current service or model references, so this migration does not create parallel tables for them.

---

## License

MIT License. Designed for authorized security evaluation and defensive auditing.
