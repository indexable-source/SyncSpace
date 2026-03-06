"""
Full API endpoint test suite for Group Schedule Synchronizer
"""
import requests
import sys

base = "http://localhost:8000"
results = []


def test(name, r):
    ok = 200 <= r.status_code < 300
    tag = "PASS" if ok else "FAIL"
    results.append((name, r.status_code, tag))
    body = r.text[:250]
    print(f"  [{tag}] {r.status_code} -> {body}")
    return r


def expect_error(name, r, code=400):
    tag = "PASS" if r.status_code == code else "FAIL"
    results.append((name, r.status_code, tag))
    print(f"  [{tag}] {r.status_code} (expected {code}) -> {r.text[:200]}")
    return r


# 1. Health
print("1. GET /health")
test("Health", requests.get(f"{base}/health"))

# 2. Register
print("2. POST /api/auth/register")
r = requests.post(f"{base}/api/auth/register", json={
    "username": "fulltest", "password": "test123456",
    "email": "fulltest@x.com", "display_name": "Full Tester"
})
if r.status_code == 400:
    print(f"  [EXPECTED] 400 (user exists)")
    results.append(("Register", 400, "EXPECTED"))
else:
    test("Register", r)

# 3. Login
print("3. POST /api/auth/login")
r = test("Login", requests.post(f"{base}/api/auth/login", json={
    "username": "fulltest", "password": "test123456"
}))
token = r.json().get("token", "")
if not token:
    print("NO TOKEN - aborting")
    sys.exit(1)
hdrs = {"Authorization": f"Bearer {token}"}

# 4. Auth me
print("4. GET /api/auth/me")
test("Auth Me", requests.get(f"{base}/api/auth/me", headers=hdrs))

# 5. Update profile
print("5. PUT /api/auth/profile")
test("Update Profile", requests.put(f"{base}/api/auth/profile", json={
    "display_name": "Updated Tester", "email": "updated@x.com"
}, headers=hdrs))

# 6. Verify profile update
print("6. GET /api/auth/me (verify update)")
r = test("Verify Profile", requests.get(f"{base}/api/auth/me", headers=hdrs))
user = r.json().get("user", {})
dn_ok = user.get("display_name") == "Updated Tester"
em_ok = user.get("email") == "updated@x.com"
print(f"    -> display_name correct: {dn_ok}, email correct: {em_ok}")

# 7. Profile validation (empty name)
print("7. PUT /api/auth/profile (empty name - expect 400)")
expect_error("Profile Validation",
    requests.put(f"{base}/api/auth/profile", json={"display_name": " "}, headers=hdrs))

# 8. Change password
print("8. PUT /api/auth/change-password")
test("Change Password", requests.put(f"{base}/api/auth/change-password", json={
    "current_password": "test123456", "new_password": "newpass789"
}, headers=hdrs))

# 9. Login with new password
print("9. POST /api/auth/login (new password)")
r = test("Login New Pass", requests.post(f"{base}/api/auth/login", json={
    "username": "fulltest", "password": "newpass789"
}))
hdrs2 = {"Authorization": f"Bearer {r.json()['token']}"}

# 10. Wrong current password (expect 400)
print("10. PUT /api/auth/change-password (wrong current)")
expect_error("Bad Password",
    requests.put(f"{base}/api/auth/change-password", json={
        "current_password": "wrongpass", "new_password": "another123"
    }, headers=hdrs2))

# 11. Same password (expect 400)
print("11. PUT /api/auth/change-password (same password)")
expect_error("Same Password",
    requests.put(f"{base}/api/auth/change-password", json={
        "current_password": "newpass789", "new_password": "newpass789"
    }, headers=hdrs2))

# 12. Reset password back
requests.put(f"{base}/api/auth/change-password", json={
    "current_password": "newpass789", "new_password": "test123456"
}, headers=hdrs2)

# re-login for fresh token
r = requests.post(f"{base}/api/auth/login", json={"username": "fulltest", "password": "test123456"})
hdrs = {"Authorization": f"Bearer {r.json()['token']}"}

# 13. Get schedules
print("13. GET /api/schedules")
test("Get Schedules", requests.get(f"{base}/api/schedules", headers=hdrs))

# 14. Save schedule
print("14. POST /api/schedules")
test("Save Schedule", requests.post(f"{base}/api/schedules", json={
    "entries": [
        {"day_of_week": 0, "start_time": "09:00", "end_time": "10:00", "subject": "Math", "room": "A101"},
        {"day_of_week": 2, "start_time": "14:00", "end_time": "15:30", "subject": "Physics", "room": "B202"},
    ],
    "replace_all": False
}, headers=hdrs))

# 15. List groups
print("15. GET /api/groups")
test("List Groups", requests.get(f"{base}/api/groups", headers=hdrs))

# 16. Create group
print("16. POST /api/groups")
r = test("Create Group", requests.post(f"{base}/api/groups", json={
    "name": "API Test Group", "description": "Created by test"
}, headers=hdrs))
gid = r.json().get("group", {}).get("id") if r.status_code == 200 else None

# 17. Get group detail
if gid:
    print(f"17. GET /api/groups/{gid}")
    test("Group Detail", requests.get(f"{base}/api/groups/{gid}", headers=hdrs))

# 18. ERP init-login
print("18. POST /api/erp/init-login")
test("ERP Init", requests.post(f"{base}/api/erp/init-login"))

# SUMMARY
print()
passed = sum(1 for _, _, t in results if t == "PASS")
expected = sum(1 for _, _, t in results if t == "EXPECTED")
failed = sum(1 for _, _, t in results if t == "FAIL")
print("=" * 60)
print(f"  RESULTS: {passed} passed, {expected} expected, {failed} failed")
print("=" * 60)
for name, code, tag in results:
    emoji = "+" if tag in ("PASS", "EXPECTED") else "X"
    print(f"  {emoji} {name:25s} {code} [{tag}]")

if failed:
    print(f"\n  WARNING: {failed} test(s) FAILED!")
    sys.exit(1)
else:
    print("\n  ALL TESTS PASSED!")
