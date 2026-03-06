"""
Timetable HTML Parser
Extracts HTML tables and structured schedule data from KL University ERP timetable page.

Two-phase approach:
  Phase 1 — extract_tables(): Pull ALL <table> elements from the page as raw HTML
             so the frontend can display them for user selection.
  Phase 2 — parse_selected_table(): Parse a specific table's HTML into structured entries.
"""

from bs4 import BeautifulSoup, Tag
import re
import logging

logger = logging.getLogger(__name__)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
DAY_INDEX = {d: i for i, d in enumerate(DAYS)}


def extract_tables(html: str) -> list[dict]:
    """
    Extract all meaningful tables from the ERP page.
    Returns a list of dicts with table metadata + raw HTML for frontend display.
    """
    soup = BeautifulSoup(html, "html.parser")
    tables = []

    for idx, table in enumerate(soup.find_all("table")):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue  # Skip tiny/empty tables

        # Try to find a heading/label near this table
        label = _find_table_label(table, idx)

        # Get the raw HTML of the table (preserving structure, styles, bg colors)
        table_html = _clean_table_html(table)

        # Count rows and columns for metadata
        header_cells = rows[0].find_all(["th", "td"])
        num_rows = len(rows)
        num_cols = max(len(row.find_all(["th", "td"])) for row in rows)

        # Quick preview — first few cell texts
        preview_texts = []
        for row in rows[:3]:
            for cell in row.find_all(["th", "td"])[:5]:
                t = cell.get_text(strip=True)[:40]
                if t:
                    preview_texts.append(t)

        tables.append({
            "index": idx,
            "label": label,
            "num_rows": num_rows,
            "num_cols": num_cols,
            "preview": " | ".join(preview_texts[:8]),
            "html": table_html,
        })

    logger.info(f"Extracted {len(tables)} tables from ERP page")
    return tables


def _find_table_label(table: Tag, fallback_idx: int) -> str:
    """Try to find a descriptive label for a table by looking at siblings/parents."""
    # Look for preceding heading
    for sib in table.previous_siblings:
        if isinstance(sib, Tag):
            if sib.name in ("h1", "h2", "h3", "h4", "h5", "h6", "caption", "label"):
                text = sib.get_text(strip=True)
                if text:
                    return text
            # Also check for panel/card titles
            title = sib.find(["h1", "h2", "h3", "h4", "h5", "span"], class_=re.compile(r"(title|header|heading)", re.I))
            if title:
                text = title.get_text(strip=True)
                if text:
                    return text
            break  # Only check immediate previous sibling

    # Check parent container for a title
    parent = table.parent
    if parent:
        heading = parent.find(["h1", "h2", "h3", "h4", "caption"], recursive=False)
        if heading:
            text = heading.get_text(strip=True)
            if text:
                return text

    # Check the table's own caption
    caption = table.find("caption")
    if caption:
        return caption.get_text(strip=True)

    return f"Table {fallback_idx + 1}"


def _clean_table_html(table: Tag) -> str:
    """
    Return clean HTML for the table, preserving cell bg colors and colspans
    but removing scripts, event handlers, and unnecessary attributes.
    """
    # Clone the table
    table_copy = BeautifulSoup(str(table), "html.parser").find("table")

    # Remove scripts
    for script in table_copy.find_all("script"):
        script.decompose()

    # Remove onclick/event handlers but keep style & class & colspan & rowspan
    KEEP_ATTRS = {"style", "class", "colspan", "rowspan", "bgcolor", "width", "height", "align"}
    for tag in table_copy.find_all(True):
        attrs_to_remove = [k for k in tag.attrs if k not in KEEP_ATTRS]
        for k in attrs_to_remove:
            del tag[k]

    return str(table_copy)


def _clean_cell_text(raw: str) -> tuple[str, str, str]:
    """
    Parse a single ERP cell into (subject, entry_type_letter, room).

    Common raw formats from KL ERP:
      "24SDCS02-S - S-9 - RoomNo-H-107"
      "24MT2012-L - S-6 - RoomNo-H006"
      "24AD2204-P24AD2204-P - S-5 - RoomNo-H-107"   (duplicated course codes)
      "24CS2261F-L - S-5 - RoomNo-H-206"

    Returns (course_with_type, type_letter, room).
    Example: ("24SDCS02-S", "S", "H-107")
    """
    raw = raw.strip()
    if not raw:
        return ("", "", "")

    # ---- Step 1: Extract room number (everything after "RoomNo-") ----
    room = ""
    room_match = re.search(r'Room\s*[Nn]o\s*-?\s*(.+?)$', raw)
    if room_match:
        room = room_match.group(1).strip()
        # Clean up the room name (e.g., H-107 -> H107, H108(1) -> H108)
        room = re.sub(r'-', '', room)           # remove hyphens
        room = re.sub(r'\(\d+\)', '', room)     # remove (1), (2), etc
        room = room.strip()
        
        # Remove the room part from the working string
        raw = raw[:room_match.start()].strip().rstrip('-').strip()

    # ---- Step 2: Extract course code + type letter ----
    # The course code looks like "24SDCS02" or "24CS2261F" followed by a dash and
    # a single letter indicating type (S=Seminar, L=Lecture/Lab, P=Practical, T=Tutorial)
    # Sometimes the code is duplicated (e.g. "24AD2204-P24AD2204-P")
    course_match = re.search(r'(\d{2}[A-Z]{2,6}\d{2,4}[A-Z]?)\s*-\s*([SLPT])', raw)
    if course_match:
        code = course_match.group(1).strip()
        type_letter = course_match.group(2).strip()
        subject = f"{code}-{type_letter}"
        return (subject, type_letter, room)

    # Fallback: just take the first token before any " - " separator
    parts = [p.strip() for p in raw.split(' - ')]
    subject = parts[0] if parts else raw
    # Try to get the type letter from the subject if it ends with -X
    type_match = re.search(r'-([SLPT])$', subject)
    type_letter = type_match.group(1) if type_match else ""

    return (subject, type_letter, room)


# ─── Official KL University 2024 Batch Timings ──────────────────────────────
# 9 ERP columns (indices 0-8). Column 5 (6th slot) = Lunch Break, always skip.
#
# Period I   : 08:10 – 09:00
# Period II  : 09:00 – 09:50
#   Break I  : 09:50 – 10:00
# Period III : 10:00 – 10:50
# Period IV  : 10:50 – 11:40
#   Break II : 11:40 – 11:50
# Period V   : 11:50 – 12:40
#   Lunch    : 12:40 – 13:20  ← ERP column index 5
# Period VI  : 13:20 – 14:10
#   Break III: 14:10 – 14:20
# Period VII : 14:20 – 15:10
# Period VIII: 15:10 – 16:00
#
SLOT_TIMINGS = [
    ("08:10", "09:00"),   # 0 → Period I
    ("09:00", "09:50"),   # 1 → Period II
    ("10:00", "10:50"),   # 2 → Period III   (after 10min Break I)
    ("10:50", "11:40"),   # 3 → Period IV
    ("11:50", "12:40"),   # 4 → Period V     (after 10min Break II)
    ("12:40", "13:20"),   # 5 → LUNCH BREAK  (always skip)
    ("13:20", "14:10"),   # 6 → Period VI
    ("14:20", "15:10"),   # 7 → Period VII   (after 10min Break III)
    ("15:10", "16:00"),   # 8 → Period VIII
]
LUNCH_SLOT = 5  # 0-indexed


def parse_selected_table(table_html: str) -> list[dict]:
    """
    Parse a SINGLE table's HTML into structured timetable entries.
    Uses the hardcoded KL University 2024 Batch slot timings.
    """
    soup = BeautifulSoup(table_html, "html.parser")
    table = soup.find("table")
    if not table:
        return []

    entries = []
    rows = table.find_all("tr")
    if len(rows) < 2:
        return []

    # Parse day rows (skip the header row)
    for row in rows[1:]:
        cells = row.find_all(["th", "td"])
        if not cells:
            continue

        # First cell is the day name
        day_text = cells[0].get_text(strip=True)
        day_idx = None
        for day_name, idx in DAY_INDEX.items():
            if day_name.lower().startswith(day_text.lower()[:3]):
                day_idx = idx
                break
        if day_idx is None:
            continue

        slot_idx = 0
        for cell in cells[1:]:
            # Stop if we've gone past our 9 known slots
            if slot_idx >= len(SLOT_TIMINGS):
                break

            colspan = int(cell.get("colspan", 1))
            raw_text = cell.get_text(strip=True)

            # Skip lunch break slot
            if slot_idx == LUNCH_SLOT:
                slot_idx += colspan
                continue

            # Skip cells with no meaningful content
            if not raw_text or raw_text.lower() in ("-", "free", "lunch", "break", "—"):
                slot_idx += colspan
                continue

            # Parse the cell text
            subject, type_letter, room = _clean_cell_text(raw_text)

            if subject:
                start_time = SLOT_TIMINGS[slot_idx][0]
                # For multi-column spans, extend until the last covered slot (capped at 8)
                end_slot_idx = min(slot_idx + colspan, len(SLOT_TIMINGS)) - 1
                end_time = SLOT_TIMINGS[end_slot_idx][1]

                # Determine entry type
                entry_type = "class"
                if type_letter in ("P",):
                    entry_type = "practical"
                elif type_letter in ("L",):
                    entry_type = "lab"

                entries.append({
                    "day_of_week": day_idx,
                    "start_time": start_time,
                    "end_time": end_time,
                    "subject": subject,
                    "room": room,
                    "entry_type": entry_type,
                })

            slot_idx += colspan

    # ── Post-processing: Merge consecutive entries of the same class ──
    merged_entries = []
    for d in range(6):
        day_entries = sorted(
            [e for e in entries if e["day_of_week"] == d],
            key=lambda x: x["start_time"]
        )
        if not day_entries:
            continue

        current = dict(day_entries[0])  # shallow copy
        for nxt in day_entries[1:]:
            if current["subject"] == nxt["subject"] and current["room"] == nxt["room"]:
                current["end_time"] = nxt["end_time"]
            else:
                merged_entries.append(current)
                current = dict(nxt)
        merged_entries.append(current)

    logger.info(
        f"Parsed {len(merged_entries)} merged entries from selected table "
        f"(originally {len(entries)})"
    )
    return merged_entries

