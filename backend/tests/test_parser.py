import pytest
from app.erp.timetable_parser import _clean_cell_text

def test_clean_cell_text_standardizes_rooms():
    # Regular lecture
    subj, t, room = _clean_cell_text("24SDCS02-S - S-9 - RoomNo-H-107")
    assert subj == "24SDCS02-S"
    assert t == "S"
    assert room == "H107"

    # Regular lab with different spacing
    subj, t, room = _clean_cell_text("24MT2012-L - S-6 - RoomNo-H006")
    assert subj == "24MT2012-L"
    assert t == "L"
    assert room == "H006"

    # Duplicated course codes
    subj, t, room = _clean_cell_text("24AD2204-P24AD2204-P - S-5 - RoomNo-H-107")
    assert subj == "24AD2204-P"
    assert t == "P"
    assert room == "H107"

    # Parenthetical numbers in room
    subj, t, room = _clean_cell_text("24CS2261F-L - S-5 - RoomNo-H108(1)")
    assert subj == "24CS2261F-L"
    assert t == "L"
    assert room == "H108"
    
    # Parenthetical and hyphen combined
    subj, t, room = _clean_cell_text("19CS1204-P - P-8 - RoomNo-C-404(2)")
    assert subj == "19CS1204-P"
    assert t == "P"
    assert room == "C404"
