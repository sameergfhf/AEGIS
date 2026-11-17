from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.schedule_logic import next_occurrence


def test_daily_schedule_uses_configured_timezone_and_advances_local_time():
    schedule = SimpleNamespace(cadence="daily", timezone_name="Asia/Kolkata", local_time="09:30", weekday=None)
    after = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
    result = next_occurrence(schedule, after)
    assert result == datetime(2026, 11, 17, 4, 0, tzinfo=timezone.utc)


def test_weekly_schedule_selects_configured_weekday():
    schedule = SimpleNamespace(cadence="weekly", timezone_name="UTC", local_time="02:00", weekday=0)
    after = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)  # Tuesday
    result = next_occurrence(schedule, after)
    assert result == datetime(2026, 11, 23, 2, 0, tzinfo=timezone.utc)


def test_interval_has_minimum_and_schedules_from_claim_time():
    schedule = SimpleNamespace(cadence="interval", interval_minutes=15)
    after = datetime(2026, 11, 17, 3, 0, tzinfo=timezone.utc)
    assert next_occurrence(schedule, after) == datetime(2026, 11, 17, 3, 15, tzinfo=timezone.utc)
