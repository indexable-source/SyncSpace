import pytest
from app.schedules.sync import find_common_free_slots

def test_sync_no_users():
    assert find_common_free_slots([]) == []

def test_sync_one_user_one_class():
    schedules = {
        1: [
            {"day_of_week": 0, "start_time": "09:00", "end_time": "10:00"}
        ]
    }
    slots = find_common_free_slots(schedules, min_duration_minutes=60)
    
    # Check that Monday has free slots outside the class time
    monday_slots = [s for s in slots if s["day_of_week"] == 0]
    
    # 08:00 - 09:00 (60min)
    assert any(s["start_time"] == "08:00" and s["end_time"] == "09:00" for s in monday_slots)
    # 10:00 - 18:00 (480min)
    assert any(s["start_time"] == "10:00" and s["end_time"] == "18:00" for s in monday_slots)
    
    # Other days should be entirely free (08:00-18:00 = 600m)
    tuesday_slots = [s for s in slots if s["day_of_week"] == 1]
    assert len(tuesday_slots) == 1
    assert tuesday_slots[0]["start_time"] == "08:00"
    assert tuesday_slots[0]["end_time"] == "18:00"
    assert tuesday_slots[0]["duration_minutes"] == 600

def test_sync_two_users_overlapping():
    schedules = {
        1: [ # User 1
            {"day_of_week": 0, "start_time": "09:00", "end_time": "12:00"}
        ],
        2: [ # User 2
            {"day_of_week": 0, "start_time": "11:00", "end_time": "14:00"}
        ]
    }
    
    # Combined busy should be 09:00-14:00.
    # Therefore, free should be 08:00-09:00 and 14:00-18:00 on Monday
    
    slots = find_common_free_slots(schedules, min_duration_minutes=60)
    monday_slots = [s for s in slots if s["day_of_week"] == 0]
    
    assert len(monday_slots) == 2
    assert monday_slots[0]["start_time"] == "08:00"
    assert monday_slots[0]["end_time"] == "09:00"
    
    assert monday_slots[1]["start_time"] == "14:00"
    assert monday_slots[1]["end_time"] == "18:00"
