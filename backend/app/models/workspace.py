"""
app/models/workspace.py — SQLAlchemy models for Workspaces, Members, APIs, Policies, Incidents, and Notifications.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="security_analyst")
    status: Mapped[str] = mapped_column(String(20), default="active")
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkspaceApi(Base):
    __tablename__ = "workspace_apis"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    environment: Mapped[str] = mapped_column(String(32), default="development")
    project_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkspaceSecurityPolicy(Base):
    __tablename__ = "workspace_security_policies"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(64), nullable=False)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    severity: Mapped[str] = mapped_column(String(32), default="high")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    alert_on_violation: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkspaceIncident(Base):
    __tablename__ = "workspace_incidents"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    api_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    related_scan_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(32), default="medium")
    status: Mapped[str] = mapped_column(String(32), default="open")
    assigned_to: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkspaceNotification(Base):
    __tablename__ = "workspace_notifications"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
