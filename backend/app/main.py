"""
app/main.py — FastAPI application entry point.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.auth_routes import router as auth_router
from app.api.workspace_routes import router as workspace_router
from app.config import get_settings
from app.database import init_db
from app.api.schedule_routes import router as schedule_router
from app.api.analytics_routes import router as analytics_router
from app.services.schedule_service import scheduler_loop, stop_active_executions

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database on startup."""
    await init_db()
    scheduler_task = asyncio.create_task(scheduler_loop())
    try:
        yield
    finally:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
        await stop_active_executions()


app = FastAPI(
    title="API Sentinel",
    description="Security scanner and behavior visualizer for HTTP APIs.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.get("/health", include_in_schema=False)
async def root_health():
    return {"status": "ok", "service": "api-sentinel"}

app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(schedule_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(workspace_router, prefix="/api")
