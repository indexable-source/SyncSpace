"""
Schedule Sync Algorithm
Finds common free slots across multiple users' schedules.
"""


def time_to_minutes(t: str) -> int:
    """Convert "HH:MM" to minutes since midnight."""
    h, m = map(int, t.split(":"))
    return h * 60 + m


def minutes_to_time(m: int) -> str:
    """Convert minutes since midnight to "HH:MM"."""
    return f"{m // 60:02d}:{m % 60:02d}"


def find_common_free_slots(
    user_schedules: dict[int, list[dict]],
    day_start: str = "08:00",
    day_end: str = "16:00",
    min_duration_minutes: int = 30,
) -> list[dict]:
    """
    Find common free time slots across all users.
    
    Args:
        user_schedules: {user_id: [{day_of_week, start_time, end_time, ...}]}
        day_start: earliest time to consider (default 8 AM)
        day_end: latest time to consider (default 6 PM)
        min_duration_minutes: minimum free slot duration
    
    Returns:
        List of {day_of_week, start_time, end_time, duration_minutes} sorted by day then time.
    """
    if not user_schedules:
        return []

    start_min = time_to_minutes(day_start)
    end_min = time_to_minutes(day_end)
    free_slots = []

    for day in range(6):  # Mon-Sat
        # Collect all busy intervals for this day across all users
        busy_intervals = []
        for user_id, schedule in user_schedules.items():
            for entry in schedule:
                if entry["day_of_week"] == day:
                    s = time_to_minutes(entry["start_time"])
                    e = time_to_minutes(entry["end_time"])
                    busy_intervals.append((s, e))

        # Merge overlapping busy intervals
        busy_intervals.sort()
        merged = []
        for start, end in busy_intervals:
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))

        # Find gaps (free slots) between busy intervals within day bounds
        current = start_min
        for busy_start, busy_end in merged:
            if busy_start > current:
                gap_start = max(current, start_min)
                gap_end = min(busy_start, end_min)
                duration = gap_end - gap_start
                if duration >= min_duration_minutes:
                    free_slots.append({
                        "day_of_week": day,
                        "start_time": minutes_to_time(gap_start),
                        "end_time": minutes_to_time(gap_end),
                        "duration_minutes": duration,
                    })
            current = max(current, busy_end)

        # Check remaining time at end of day
        if current < end_min:
            duration = end_min - current
            if duration >= min_duration_minutes:
                free_slots.append({
                    "day_of_week": day,
                    "start_time": minutes_to_time(current),
                    "end_time": minutes_to_time(end_min),
                    "duration_minutes": duration,
                })

    return free_slots
