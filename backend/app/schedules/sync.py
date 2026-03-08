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


def _merge_same_subject_across_breaks(entries: list[dict], max_break_minutes: int = 15) -> list[dict]:
    """
    Merge adjacent schedule entries of the same subject on the same day
    if they are separated by a gap of <= max_break_minutes.
    
    Example: If user has "DSA" 09:00-09:50 and "DSA" 10:00-10:50 with
    a 10-min break between them, merge into "DSA" 09:00-10:50.
    This makes the break "busy" so it won't be schedulable.
    """
    if not entries:
        return entries

    # Group by day
    by_day: dict[int, list[dict]] = {}
    for e in entries:
        by_day.setdefault(e["day_of_week"], []).append(e)

    result = []
    for day, day_entries in by_day.items():
        # Sort by start time
        sorted_entries = sorted(day_entries, key=lambda e: time_to_minutes(e["start_time"]))
        merged = [sorted_entries[0].copy()]

        for entry in sorted_entries[1:]:
            prev = merged[-1]
            prev_end = time_to_minutes(prev["end_time"])
            curr_start = time_to_minutes(entry["start_time"])
            gap = curr_start - prev_end

            # Merge if same subject and gap <= max_break_minutes
            prev_subj = (prev.get("subject") or "").strip().lower()
            curr_subj = (entry.get("subject") or "").strip().lower()

            if prev_subj and curr_subj and prev_subj == curr_subj and 0 <= gap <= max_break_minutes:
                # Extend the previous entry to cover through this one
                prev["end_time"] = entry["end_time"]
            else:
                merged.append(entry.copy())

        result.extend(merged)

    return result


def find_common_free_slots(
    user_schedules: dict[int, list[dict]],
    day_start: str = "08:00",
    day_end: str = "16:00",
    min_duration_minutes: int = 30,
) -> list[dict]:
    """
    Find common free time slots across all users.
    
    Args:
        user_schedules: {user_id: [{day_of_week, start_time, end_time, subject, ...}]}
        day_start: earliest time to consider (default 8 AM)
        day_end: latest time to consider (default 4 PM)
        min_duration_minutes: minimum free slot duration
    
    Returns:
        List of {day_of_week, start_time, end_time, duration_minutes} sorted by day then time.
    """
    if not user_schedules:
        return []

    # Preprocess: merge same-subject entries across short breaks for each user
    processed_schedules = {}
    for user_id, schedule in user_schedules.items():
        processed_schedules[user_id] = _merge_same_subject_across_breaks(schedule)

    start_min = time_to_minutes(day_start)
    end_min = time_to_minutes(day_end)
    free_slots = []

    for day in range(6):  # Mon-Sat
        # Collect all busy intervals for this day across all users
        busy_intervals = []
        for user_id, schedule in processed_schedules.items():
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
