"""Timezone-aware schedule recurrence calculations without database dependencies."""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def next_occurrence(schedule, after: datetime) -> datetime:
    if after.tzinfo is None:
        after = after.replace(tzinfo=timezone.utc)
    after = after.astimezone(timezone.utc)
    if schedule.cadence == "interval":
        return after + timedelta(minutes=max(15, min(schedule.interval_minutes or 60, 10080)))
    try:
        local_zone = ZoneInfo(schedule.timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Unknown timezone name.") from exc
    hour, minute = (int(x) for x in schedule.local_time.split(":"))
    local_after = after.astimezone(local_zone)
    days = 0
    if schedule.cadence == "weekly":
        days = ((schedule.weekday if schedule.weekday is not None else 0) - local_after.weekday()) % 7
    candidate = datetime.combine(local_after.date() + timedelta(days=days), time(hour, minute), local_zone)
    if candidate <= local_after:
        candidate += timedelta(days=7 if schedule.cadence == "weekly" else 1)
    return candidate.astimezone(timezone.utc)
