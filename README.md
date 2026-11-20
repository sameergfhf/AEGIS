# AEGIS — API Sentinel

**AEGIS** is an enterprise-grade, full-stack API security scanner, behavior visualizer, and posture management platform. It executes observable, non-destructive security probes against target HTTP APIs, calculates evidence-based Security Assessment Scores (0–100), visualizes real-time request lifecycles through interactive diagrams, and facilitates multi-tenant team collaboration.

---

## Key Capabilities

| Feature Category | Capabilities |
|---|---|
| **High-Performance Security Probes** | Non-blocking concurrent evaluation of HTTPS/TLS certificates, context-aware HTTP security headers, sensitive token and secret leakage detection, and domain/redirect reputation checks (VirusTotal & Google Safe Browsing). |
| **Evidence-Based Scoring** | 0–100 Security Assessment Score with assessment coverage indicators, excluding unconfigured/inconclusive checks from penalization. |
| **Interactive Telemetry** | Staggered multi-sample latency line charts, severity distribution breakdowns, and interactive React Flow request lifecycle diagrams. |
| **Request Inspector** | Sanitized inspection of request headers, bodies, response payloads, and redirect chains with automated credential and secret redaction. |
| **OpenAPI 3.0 Analyzer** | Automated endpoint discovery from JSON/YAML specifications with single-operation probe execution wizards. |
| **Multi-Tenancy & Workspaces** | Native team workspaces, member invitation flows, role-based access control (Owner, Admin, Member), policies, and scoped audit logs. |
| **Direct Cloud Persistence** | Direct asyncpg connection to **Neon Serverless PostgreSQL** using a lean 11-table schema (`schema.sql`). Zero local SQLite sync overhead. |
| **Native JWT & OAuth** | Built-in salted PBKDF2-HMAC-SHA256 password hashing, signed JWT session management (1-day expiration), and Google/GitHub OAuth integrations. |
| **SSRF Defense** | Multi-layer IP resolution validation blocking loopback, private RFC1918, link-local, multicast, and cloud metadata addresses. |
| **Executive Reports** | Downloadable security audit reports generated via ReportLab in PDF format. |

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Recharts, React Flow, React Router v7 |
| **Design System** | Aegis Cyber Intelligence System (`frontend/src/components/ui/`, dark glassmorphism) |
| **Backend** | Python 3.12+, FastAPI, HTTPX (async client), SQLAlchemy 2.0 (async), asyncpg |
| **Database** | Neon Serverless PostgreSQL (`postgresql+asyncpg://...`) |
| **Auth & Security** | Native JWT (`PyJWT`), PBKDF2 Password Hashing, Google & GitHub OAuth |
| **Threat Intelligence** | VirusTotal API v3, Google Safe Browsing Lookup API v4 |
| **PDF Engine** | ReportLab |
| **Testing** | Pytest + pytest-asyncio (Backend), Vitest (Frontend) |
| **Containerization** | Docker, Docker Compose, Nginx (Alpine) |

---

## Architecture & Database Schema

AEGIS operates directly against **Neon Serverless PostgreSQL** with an optimized 11-table consolidated architecture:

```mermaid
erDiagram
    USERS ||--o{ SCANS : executes
    USERS ||--o{ WORKSPACE_MEMBERS : belongs_to
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : contains
    WORKSPACES ||--o{ SCANS : owns
    WORKSPACES ||--o{ WORKSPACE_APIS : catalogs
    WORKSPACES ||--o{ WORKSPACE_POLICIES : enforces
    WORKSPACES ||--o{ WORKSPACE_INCIDENTS : tracks
    WORKSPACES ||--o{ WORKSPACE_NOTIFICATIONS : alerts
    SCANS ||--o{ FINDINGS : produces
    SCANS ||--o{ SCHEDULED_SCANS : automated_by
```

### Core Database Tables
1. **`users`**: User identity, native PBKDF2 password hashes, and OAuth profile mapping.
2. **`scans`**: Scan execution metadata, duration, score, and full sanitized telemetry payload (`result_json`).
3. **`findings`**: Granular security findings categorized by severity (`critical`, `high`, `medium`, `low`, `informational`).
4. **`scheduled_scans`**: Automated recurring scans and cadence schedules.
5. **`workspaces`**: Team collaboration containers with tier tracking.
6. **`workspace_members`**: RBAC permissions (`owner`, `admin`, `member`, `viewer`).
7. **`workspace_apis`**: Catalog of monitored API services and operational baselines.
8. **`workspace_security_policies`**: Governance rules (e.g., minimum score thresholds, forbidden headers).
9. **`workspace_incidents`**: Automated policy breach alerts and remediation workflows.
10. **`workspace_notifications`**: In-app and outbound team alert events.
11. **`workspace_audit_logs`**: Tamper-evident activity logs tracking workspace actions.

---

## Quick Start (Local Development)

### Prerequisites
- **Python 3.11+**
- **Node.js 20+**
- **Neon PostgreSQL Database** (or any PostgreSQL 15+ instance)
- *(Optional)* VirusTotal and Google Safe Browsing API keys

### 1. Configuration

1. **Backend Environment** (`backend/.env`):
   ```bash
   cp backend/.env.example backend/.env
   ```
   Configure the following in `backend/.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://<user>:<password>@<neon-host>/neondb?ssl=require
   JWT_SECRET_KEY=<your-random-32-byte-hex-secret>
   JWT_EXPIRE_MINUTES=1440
   FRONTEND_URL=http://localhost:3000
   BACKEND_URL=http://localhost:8000
   ```

2. **Frontend Environment** (`frontend/.env`):
   ```bash
   cp frontend/.env.example frontend/.env
   ```
   Set the API base URL:
   ```env
   VITE_API_BASE_URL=http://localhost:8000/api
   ```

### 2. Database Initialization

Execute the master schema directly in your Neon console or via `psql`:
```bash
psql "<your-neon-database-url>" -f schema.sql
```

### 3. Start Backend

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Start Frontend

In a separate terminal:
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

- **Frontend Application:** `http://localhost:3000`
- **Backend API:** `http://localhost:8000`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

---

## Latency & Scanning Pipeline

AEGIS scans are engineered for sub-2-second response times through parallelization:

1. **SSRF Pre-Validation**: Scheme validation, DNS resolution, and IP range verification run in milliseconds.
2. **Primary Request**: Initial HTTP handshake and sanitized body collection with connection pooling.
3. **Concurrent Security Probes (`asyncio.gather`)**:
   - **TLS Checker**: Offloaded to a non-blocking threadpool (`asyncio.to_thread`).
   - **HTTP Headers Checker**: In-memory inspection of security headers.
   - **Sensitive Data Leakage**: Regex-based token and key detection.
   - **Threat Intelligence**: Async queries to VirusTotal and Google Safe Browsing.
   - **Latency Probing**: Staggered, connection-pooled multi-sample latency requests.
4. **Adaptive UI Polling**: The frontend checks status after 600ms, then every 1000ms, presenting results instantly upon completion.

---

## Multi-Layer SSRF Defense

AEGIS strictly prevents Server-Side Request Forgery:
1. **Protocol Restriction**: Only `http://` and `https://` schemes are accepted.
2. **Strict IP Filtering**: DNS resolution is performed before requests. Loopback (`127.0.0.0/8`, `::1`), private RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), multicast, and cloud metadata (`169.254.169.254`) addresses are blocked.
3. **Credential Stripping**: Embedded user credentials in URLs (`http://user:pass@host`) are immediately rejected.
4. **Redirect Validation**: Every redirect hop is independently validated against the SSRF filter before navigation.
5. **Bounded Execution**: Maximum response size is capped at 512 KB, and strict timeouts prevent hanging sockets.

---

## API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend status, Neon database connectivity, and threat intelligence state |
| `POST` | `/api/auth/register` | Register new user account with native password hashing |
| `POST` | `/api/auth/login` | Authenticate user and receive signed JWT access token |
| `GET` | `/api/auth/google/callback` | Google OAuth token exchange & user sign-in |
| `GET` | `/api/auth/github/callback` | GitHub OAuth token exchange & user sign-in |
| `POST` | `/api/scans` | Submit target URL for automated probe scanning (returns 202 Accepted) |
| `GET` | `/api/scans/{scan_id}` | Poll scan status, duration, score, and summary metrics |
| `GET` | `/api/scans/{scan_id}/findings` | Retrieve all security findings with remediation guidance |
| `GET` | `/api/scans/{scan_id}/visualizations` | Retrieve latency points, severity counts, and React Flow nodes/edges |
| `GET` | `/api/scans/{scan_id}/report` | Download executive PDF audit report |
| `POST` | `/api/scans/{scan_id}/compare` | Compare security posture between two scans with delta findings |
| `GET` | `/api/scans/history` | List scan history scoped by user or team workspace |
| `POST` | `/api/specifications/analyze` | Parse and inspect an OpenAPI 3.0 specification from URL or file upload |
| `GET` | `/api/workspaces` | List team workspaces for authenticated user |
| `POST` | `/api/workspaces` | Create new workspace with owner role assignment |

---

## Quality Assurance & Testing

```bash
# Run Backend Pytest suite
cd backend
pytest

# Run Frontend Production Build & TypeScript check
cd frontend
npm run build

# Run Frontend Linter
npm run lint
```

---

## License

MIT License. Designed for authorized security evaluation, governance, and defensive auditing.
