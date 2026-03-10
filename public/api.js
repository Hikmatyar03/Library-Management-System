/* =============================================================
   api.js — Centralized API Client with JWT Handling
   All API calls go through these helpers.
   ============================================================= */

const API_BASE = '/api';

// ── Token Helpers ─────────────────────────────────────────────
const Auth = {
    setToken(token) { localStorage.setItem('portal_token', token); },
    getToken() { return localStorage.getItem('portal_token'); },
    clearToken() { localStorage.removeItem('portal_token'); localStorage.removeItem('portal_role'); },
    setRole(role) { localStorage.setItem('portal_role', role); },
    getRole() { return localStorage.getItem('portal_role'); },
    isLoggedIn() { return !!Auth.getToken(); },
    redirectToLogin(role) {
        Auth.clearToken();
        window.location.href = role === 'faculty' ? '/faculty-login.html' : '/student-login.html';
    }
};

// ── Core Fetch Wrapper ────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
        // Token expired or invalid — redirect to login
        const role = Auth.getRole();
        Auth.redirectToLogin(role);
        return;
    }

    return { ok: res.ok, status: res.status, data };
}

// ── Student API ───────────────────────────────────────────────
const StudentAPI = {
    register: (body) => apiFetch('/students/register', { method: 'POST', body }),
    login: (body) => apiFetch('/students/login', { method: 'POST', body }),
    logout: () => apiFetch('/students/logout', { method: 'POST' }),
    getProfile: () => apiFetch('/students/profile'),
    updateProfile: (body) => apiFetch('/students/profile', { method: 'PUT', body }),
};

// ── Faculty API ───────────────────────────────────────────────
const FacultyAPI = {
    register: (body) => apiFetch('/faculty/register', { method: 'POST', body }),
    login: (body) => apiFetch('/faculty/login', { method: 'POST', body }),
    logout: () => apiFetch('/faculty/logout', { method: 'POST' }),
    getProfile: () => apiFetch('/faculty/profile'),
    updateProfile: (body) => apiFetch('/faculty/profile', { method: 'PUT', body }),
    getStudents: (page = 1, limit = 10) => apiFetch(`/faculty/students?page=${page}&limit=${limit}`),
    searchStudents: (q) => apiFetch(`/faculty/students/search?q=${encodeURIComponent(q)}`),
};
