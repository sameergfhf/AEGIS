# AEGIS Project Structure & Architecture Guide

This document is the authoritative architectural reference for navigating, extending, and maintaining the AEGIS security platform.

---

## 1. Clean Directory Tree

```
AEGIS/
├── schema.sql                       # Authoritative 11-table schema for Neon Serverless PostgreSQL
├── docker-compose.yml               # Multi-container orchestration (FastAPI + React/Vite)
├── package.json                     # Root task runner scripts
├── README.md                        # Platform overview & quickstart
├── .gitignore                       # Clean Git exclusion rules
│
├── docs/                            # Architectural documentation & samples
│   ├── PROJECT_STRUCTURE.md         # This developer guide
│   ├── ENTERPRISE_WORKSPACE_ARCHITECTURE.md
│   ├── INTERVIEW_VIVA_GUIDE.md
│   └── samples/                     # Sample payload & scan results
│       ├── scan_sample.json
│       └── result_json_sample.json
│
├── backend/                         # FastAPI Backend Application (Python 3.12/3.13)
│   ├── Dockerfile                   # Production container definition
│   ├── requirements.txt             # Locked dependencies (asyncpg, sqlalchemy, fastapi, etc.)
│   ├── pytest.ini                   # Pytest configuration
│   ├── .env                         # Backend environment secrets & DB connection string
│   ├── .env.example                 # Environment variable template
│   │
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point, lifespan, CORS & router mounting
│   │   ├── config.py                # Pydantic Settings loaded from .env
│   │   ├── database.py              # Async SQLAlchemy engine with asyncpg + Neon pooler
│   │   ├── schemas.py               # Pydantic validation models (Requests & Responses)
│   │   │
│   │   ├── api/                     # HTTP Endpoints (Presentation Layer)
│   │   │   ├── auth_routes.py       # Email/Pass signup, login & Google/GitHub OAuth endpoints
│   │   │   ├── auth.py              # Native JWT creation & Bearer token verification
│   │   │   ├── routes.py            # Security scans, OpenAPI analysis & comparison endpoints
│   │   │   ├── schedule_routes.py   # Scheduled recurring scan management
│   │   │   ├── analytics_routes.py  # Workspace security & scan analytics
│   │   │   └── workspace_routes.py  # Workspace team, API inventory & incident endpoints
│   │   │
│   │   ├── models/                  # Database Entities (SQLAlchemy ORM mapped to Neon)
│   │   │   ├── user.py              # User authentication profiles & OAuth providers
│   │   │   ├── scan.py              # Security assessment records & scores
│   │   │   ├── finding.py           # Individual vulnerability findings & evidence
│   │   │   ├── scheduled_scan.py    # Recurring scan automation & execution logs
│   │   │   └── workspace.py         # Workspaces, members, APIs, policies, incidents, alerts
│   │   │
│   │   ├── scanners/                # Security Scanning Engines
│   │   │   ├── tls_checker.py       # HTTPS, TLS 1.2/1.3, cipher suites & certificate validity
│   │   │   ├── headers_checker.py   # HSTS, CSP, X-Content-Type-Options, CORS headers
│   │   │   ├── leakage_checker.py   # Information disclosure, stack traces & secret leakage
│   │   │   └── reputation_checker.py# Threat intelligence (VirusTotal, Google Safe Browsing)
│   │   │
│   │   ├── security/                # Protection Utilities
│   │   │   ├── redaction.py         # Credential & token masking
│   │   │   ├── url_validation.py    # SSRF protection (private IP blocking & DNS checks)
│   │   │   └── workspace_authorization.py # RBAC permission checks against Neon
│   │   │
│   │   └── services/                # Core Business Logic
│   │       ├── scan_service.py      # Async scan pipeline orchestrator
│   │       ├── scoring.py           # Evidence-based 0–100 security scoring algorithm
│   │       ├── schedule_service.py  # Background cron/interval scheduler
│   │       ├── visualization_service.py # Latency curves & React Flow diagrams
│   │       ├── api_category_service.py  # Automatic API fingerprinting & categorization
│   │       └── governance_automation.py # Policy violation & incident auto-creation
│   │
│   └── tests/                       # Automated backend tests
│
└── frontend/                        # React 19 + TypeScript + Vite Single-Page Application
    ├── index.html                   # HTML template
    ├── package.json                 # Frontend dependencies (Axios, React Flow, Recharts)
    ├── vite.config.ts               # Vite dev server and proxy configuration
    ├── .env                         # Frontend environment configuration
    ├── .env.example                 # Frontend env template
    │
    └── src/
        ├── App.tsx                  # Router, query providers & layout shell
        ├── main.tsx                 # React entry point
        ├── types.ts                 # Global TypeScript definitions
        │
        ├── components/              # Reusable UI components
        │   ├── ui/                  # Buttons, cards, modals, badges
        │   ├── workspace/           # Team management, inventory & incident panels
        │   └── Layout.tsx           # Main navigation header & sidebar
        │
        ├── contexts/                # State management
        │   ├── AuthContext.tsx      # Native JWT authentication state (Google, GitHub, email)
        │   └── WorkspaceContext.tsx # Active team & role state
        │
        ├── pages/                   # Application views
        │   ├── Dashboard.tsx        # Quick assessment runner & recent activity
        │   ├── ScanDetail.tsx       # Interactive score report, findings & flow diagram
        │   ├── SpecAnalyzer.tsx     # OpenAPI spec upload & endpoint discovery
        │   ├── TeamManagement.tsx   # Workspace administration, members & policies
        │   ├── AuthPage.tsx         # Unified Sign In / Sign Up view
        │   └── AuthCallback.tsx     # OAuth callback handler for JWT exchange
        │
        └── services/                # API client layer
            ├── api.ts               # Axios instance with Bearer interceptor & scan endpoints
            └── workspaceService.ts  # Workspace REST client connected to backend
```

---

## 2. Key Architectural Decisions

1. **Direct-to-Neon Database Architecture:**
   - There is no local database (SQLite deleted) and no intermediate sync engine (Supabase eliminated).
   - FastAPI communicates directly with Neon Serverless PostgreSQL using asynchronous connection pooling (`asyncpg`).
2. **Authoritative 11-Table Schema:**
   - Consolidated 24 fragmented legacy tables down to 11 essential tables defined in `schema.sql`.
   - All primary keys and cross-table references use native `UUID` types.
3. **Native Auth & Social Logins:**
   - Full native authentication using PBKDF2-SHA256 password hashing and HMAC-SHA256 JWT tokens.
   - Built-in Google and GitHub OAuth endpoints with automatic user profile creation.
