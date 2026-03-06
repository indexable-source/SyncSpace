/**
 * API Client for Backend Communication
 * Production-grade with 401 interception, timeouts, and structured errors.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const REQUEST_TIMEOUT = 15000; // 15 seconds

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const api = {
  // --- Core Request Handler ---

  async request(endpoint, options = {}) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const config = {
      ...options,
      headers,
      signal: controller.signal,
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      clearTimeout(timeoutId);

      // Handle 401 — token expired/invalid
      if (response.status === 401) {
        localStorage.removeItem('token');
        // Dispatch custom event that AuthContext listens for
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth-expired'));
        }
        throw new ApiError('Session expired. Please log in again.', 401);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        // Response not JSON
        if (!response.ok) {
          throw new ApiError(`Request failed (${response.status})`, response.status);
        }
        return {};
      }

      if (!response.ok) {
        const message = data.detail || data.error || data.message || `Request failed (${response.status})`;
        throw new ApiError(message, response.status, data);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Already an ApiError, re-throw
      if (error instanceof ApiError) throw error;

      // Network errors / AbortController timeout
      if (error.name === 'AbortError') {
        throw new ApiError('Request timed out. Please check your connection.', 0);
      }

      if (error instanceof TypeError) {
        // fetch() throws TypeError on network failure
        throw new ApiError('Unable to connect to the server. Is the backend running?', 0);
      }

      throw error;
    }
  },

  // --- Auth Endpoints ---

  async checkUsername(username) {
    if (!username || username.length < 3) return { available: false };
    return this.request(`/auth/check-username/${encodeURIComponent(username)}`);
  },

  async register(username, password, email, displayName) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email, display_name: displayName })
    });
    if (data.token) localStorage.setItem('token', data.token);
    return data;
  },

  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (data.token) localStorage.setItem('token', data.token);
    return data;
  },

  logout() {
    localStorage.removeItem('token');
  },

  async getMe() {
    return this.request('/auth/me');
  },

  async updateProfile(displayName, email) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ display_name: displayName, email })
    });
  },

  async changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
  },

  async deleteAccount() {
    const result = await this.request('/auth/account', { method: 'DELETE' });
    localStorage.removeItem('token');
    return result;
  },

  async linkErp(rollNumber) {
    return this.request('/auth/link-erp', {
      method: 'POST',
      body: JSON.stringify({ roll_number: rollNumber })
    });
  },

  async unlinkErp() {
    return this.request('/auth/unlink-erp', { method: 'DELETE' });
  },

  // --- ERP Endpoints ---

  async initLogin() {
    return this.request('/erp/init-login', { method: 'POST' });
  },

  async completeLogin(sessionId, username, password, captcha) {
    return this.request('/erp/complete-login', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, username, password, captcha })
    });
  },

  async refreshCaptcha(sessionId) {
    return this.request('/erp/refresh-captcha', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId })
    });
  },

  async getTimetableOptions(sessionId) {
    return this.request('/erp/timetable-options', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId })
    });
  },

  async fetchTimetable(sessionId, academicYear, semesterId) {
    return this.request('/erp/fetch-timetable', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        academic_year: academicYear,
        semester_id: semesterId
      })
    });
  },

  async parseTable(tableHtml) {
    return this.request('/erp/parse-table', {
      method: 'POST',
      body: JSON.stringify({ table_html: tableHtml })
    });
  },

  // --- Schedule Endpoints ---

  async getMySchedule() {
    return this.request('/schedules');
  },

  async saveSchedule(entries, replaceAll = true) {
    return this.request('/schedules', {
      method: 'POST',
      body: JSON.stringify({ entries, replace_all: replaceAll })
    });
  },

  async uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for uploads

    try {
      const response = await fetch(`${API_BASE}/schedules/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 401) {
        localStorage.removeItem('token');
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth-expired'));
        throw new ApiError('Session expired. Please log in again.', 401);
      }

      const data = await response.json();
      if (!response.ok) throw new ApiError(data.detail || 'Upload failed', response.status, data);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiError) throw error;
      if (error.name === 'AbortError') throw new ApiError('Upload timed out.', 0);
      if (error instanceof TypeError) throw new ApiError('Unable to connect to the server.', 0);
      throw error;
    }
  },

  // --- Group Endpoints ---

  async getGroups() {
    return this.request('/groups');
  },

  async createGroup(name, description) {
    return this.request('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
  },

  async joinGroup(inviteCode) {
    return this.request('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode })
    });
  },

  async getGroupDetails(groupId) {
    return this.request(`/groups/${groupId}`);
  },

  async syncGroupSchedules(groupId) {
    return this.request(`/groups/${groupId}/sync`);
  },

  async createSlot(groupId, title, description, dayOfWeek, startTime, endTime) {
    return this.request(`/groups/${groupId}/schedule-slot`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime
      })
    });
  },

  async getSlots(groupId) {
    return this.request(`/groups/${groupId}/slots`);
  },

  async addMember(groupId, username) {
    return this.request(`/groups/${groupId}/add-member`, {
      method: 'POST',
      body: JSON.stringify({ username })
    });
  },

  async removeMember(groupId, userId) {
    return this.request(`/groups/${groupId}/members/${userId}`, {
      method: 'DELETE'
    });
  },

  async leaveGroup(groupId) {
    return this.request(`/groups/${groupId}/leave`, {
      method: 'POST'
    });
  },

  async deleteGroup(groupId) {
    return this.request(`/groups/${groupId}`, {
      method: 'DELETE'
    });
  },

  async updateGroup(groupId, name, description) {
    return this.request(`/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description })
    });
  },

  // --- Meeting Scheduler Endpoints ---

  async findAvailableSlots(groupId, memberIds, includeBreak) {
    return this.request(`/groups/${groupId}/find-slots`, {
      method: 'POST',
      body: JSON.stringify({ member_ids: memberIds, include_break: includeBreak })
    });
  },

  async createMeeting(groupId, title, description, dayOfWeek, startTime, endTime, participantIds, includeBreak) {
    return this.request(`/groups/${groupId}/meetings`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        participant_ids: participantIds,
        include_break: includeBreak
      })
    });
  },

  async getGroupMeetings(groupId) {
    return this.request(`/groups/${groupId}/meetings`);
  },

  async deleteMeeting(groupId, meetingId) {
    return this.request(`/groups/${groupId}/meetings/${meetingId}`, {
      method: 'DELETE'
    });
  },

  async getDashboardMeetings() {
    return this.request('/dashboard/meetings');
  }
};
