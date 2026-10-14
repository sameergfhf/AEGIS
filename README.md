# API Sentinel

**API Sentinel** is a full-stack API security scanner and behavior visualizer. It performs observable security checks against a submitted API URL, calculates an evidence-based Security Assessment Score, and generates an interactive results dashboard and downloadable PDF report.

---

## Features

| Category | Capability |
|---|---|
| **Security Tests** | HTTPS/TLS, Security Headers, Information Leakage, Domain Reputation |
| **Scoring** | Evidence-based 0–100 score with assessment coverage metric |
| **Visualizations** | HTTP latency chart, API behavior flow diagram, findings by severity |
| **Request Inspector** | Sanitized request/response viewer with redacted credentials |
| **PDF Reports** | Downloadable assessment report via ReportLab |
| **OpenAPI Analyzer** | Parse JSON/YAML specs from URL or file upload |
| **Scan History** | Persistent scan summaries with comparison view |
| **SSRF Protection** | Multi-layer URL validation blocking private/reserved IPs |

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19 + Vite + TypeScript, Tailwind CSS v4, Recharts, React Flow, React Router v6 |
| **Backend** | Python 3.12 + FastAPI, HTTPX, SQLAlchemy (async), aiosqlite |
| **Database** | SQLite (development) — upgradeable to PostgreSQL by changing `DATABASE_URL` |
| **PDF** | ReportLab |
| **Testing** | pytest + pytest-asyncio (backend), Vitest (frontend) |

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- (Optional) VirusTotal free API key

### 1. Clone and set up backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env to add your VIRUSTOTAL_API_KEY (optional but recommended)

# Start the API server
uvicorn app.main:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`.  
Interactive API docs: `http://localhost:8000/docs`

### 2. Set up frontend

```bash
cd frontend

npm install --legacy-peer-deps
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### 3. Run tests

```bash
# Backend tests
cd backend
venv\Scripts\activate
pytest

# Frontend tests (when vitest is installed)
cd frontend
npm test
```

---

## Docker (Full Stack)

```bash
# Copy and configure the backend .env
cp backend/.env.example backend/.env
# Add VIRUSTOTAL_API_KEY to backend/.env

# Build and start
docker-compose up --build

# Access at http://localhost
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend health and integration status |
| `POST` | `/api/scans` | Submit a URL for scanning (returns immediately with scan ID) |
| `GET` | `/api/scans/{scan_id}` | Poll scan status and results |
| `GET` | `/api/scans/{scan_id}/findings` | Get individual security findings |
| `GET` | `/api/scans/{scan_id}/visualizations` | Get chart and flow data |
| `GET` | `/api/scans/{scan_id}/report` | Download PDF report |
| `POST` | `/api/scans/{scan_id}/compare` | Compare two scans |
| `GET` | `/api/scans/history` | List previous scans |
| `POST` | `/api/specifications/analyze` | Analyze an OpenAPI spec (URL or file upload) |

---

## Scoring Rules

The **Security Assessment Score** is calculated as:

```
assessment_score = (earned_points / assessed_points) × 100
```

| Test | Max Points | Notes |
|---|---|---|
| HTTPS and TLS Security | 30 | Checks scheme, cert trust, hostname match, expiry |
| HTTP Security Headers | 20 | Context-aware — JSON APIs not penalized for HTML-only headers |
| Information Leakage | 25 | Deductive — starts at 25, deducts per finding |
| Domain and Redirect Reputation | 25 | Requires VirusTotal API key; marked inconclusive if unavailable |

**Assessment Coverage** = `assessed_points / 100 × 100%`

Tests marked **inconclusive** are excluded from the denominator. If no tests produce meaningful results, the score is `null`.

---

## SSRF Protections

The scanner implements defense-in-depth against Server-Side Request Forgery:

- Only `http://` and `https://` schemes are accepted
- Loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`), link-local, multicast, and metadata-service IPs are blocked
- Embedded URL credentials are rejected
- DNS resolution is performed and every resolved IP is validated
- Redirects are disabled by default; each redirect destination is individually validated
- Response sizes are bounded to 512 KB (configurable)
- Request timeouts are strictly enforced
- All outbound restrictions are enforced at the application layer; deployers should add egress firewall rules for additional protection against DNS rebinding

---

## Known Limitations

- Only observable response content (headers, body) is analyzed — internal vulnerabilities are out of scope
- The leakage scanner uses conservative pattern matching; it may miss some secrets and may produce false positives
- Reputation checks require a VirusTotal API key; without one, the test is marked inconclusive
- Authentication, injection, business logic, and IDOR vulnerabilities are outside the current scope
- A high score does not guarantee API security; professional penetration testing is recommended for production systems

---

## Project Structure

```
api-sentinel/
  backend/
    app/
      main.py                  # FastAPI entry point
      config.py                # Settings (pydantic-settings)
      schemas.py               # Pydantic request/response models
      database.py              # Async SQLAlchemy setup
      api/
        routes.py              # All FastAPI routes
      security/
        url_validation.py      # SSRF-resistant URL validation
        redaction.py           # Secret redaction utilities
      scanners/
        tls_checker.py         # Test 1: HTTPS/TLS (30 pts)
        headers_checker.py     # Test 2: Security headers (20 pts)
        leakage_checker.py     # Test 3: Information leakage (25 pts)
        reputation_checker.py  # Test 4: Domain reputation (25 pts)
      services/
        scan_service.py        # Scan orchestration
        scoring.py             # Evidence-based scoring engine
        visualization_service.py  # Chart data and flow graphs
        report_service.py      # PDF generation (ReportLab)
        openapi_service.py     # OpenAPI spec parsing
        history_service.py     # Scan history and comparison
      models/
        scan.py                # Scan ORM model
        finding.py             # Finding ORM model
      tests/
        test_url_validation.py
        test_scoring.py
        test_leakage.py
        test_headers.py
    requirements.txt
    .env.example
    Dockerfile
    pytest.ini

  frontend/
    src/
      App.tsx                  # Router
      components/
        Layout.tsx             # App shell with sidebar
        ScoreCard.tsx          # Security score display
        TestResultCard.tsx     # Collapsible test result card
        LatencyChart.tsx       # Recharts latency line chart
        FindingsChart.tsx      # Recharts findings bar chart
        FlowDiagram.tsx        # React Flow behavior diagram
        RequestInspector.tsx   # Request/response viewer
      pages/
        Dashboard.tsx          # URL input and recent scans
        ScanResults.tsx        # Full results view
        ScanHistory.tsx        # History table and comparison
        SpecAnalyzer.tsx       # OpenAPI spec analyzer
        Settings.tsx           # Configuration and status
      hooks/
        useScan.ts             # Scan lifecycle hook
      services/
        api.ts                 # Axios API client
      types/
        index.ts               # TypeScript interfaces
    .env.example
    Dockerfile
    nginx.conf

  docker-compose.yml
  README.md
```

---

## License

MIT — for educational and authorized testing purposes. Do not use API Sentinel to scan APIs you do not own or have explicit permission to test.
