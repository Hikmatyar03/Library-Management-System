/* =============================================================
   api.js - Centralized API Client
   ============================================================= */

const API_BASE = '/api';

const Auth = {
  setUserId(id) {
    localStorage.setItem('portal_user_id', id);
  },
  getUserId() {
    return localStorage.getItem('portal_user_id');
  },
  setRole(role) {
    localStorage.setItem('portal_role', role);
  },
  getRole() {
    return localStorage.getItem('portal_role');
  },
  clearSession() {
    localStorage.removeItem('portal_user_id');
    localStorage.removeItem('portal_role');
  },
  clearToken() {
    Auth.clearSession();
  },
  isLoggedIn() {
    return !!Auth.getUserId() && !!Auth.getRole();
  },
  redirectToLogin(role) {
    Auth.clearSession();

    if (role === 'faculty') {
      window.location.href = '/faculty-login.html';
      return;
    }

    if (role === 'library_admin') {
      window.location.href = '/library-admin-login.html';
      return;
    }

    window.location.href = '/student-login.html';
  },
};

async function apiFetch(endpoint, options = {}) {
  const userId = Auth.getUserId();
  const role = Auth.getRole();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (userId && role) {
    headers['X-User-Id'] = userId;
    headers['X-User-Role'] = role;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    Auth.redirectToLogin(role);
    return null;
  }

  return { ok: res.ok, status: res.status, data };
}

const StudentAPI = {
  register: (body) => apiFetch('/students/register', { method: 'POST', body }),
  login: (body) => apiFetch('/students/login', { method: 'POST', body }),
  logout: () => apiFetch('/students/logout', { method: 'POST' }),
  getProfile: () => apiFetch('/students/profile'),
  updateProfile: (body) => apiFetch('/students/profile', { method: 'PUT', body }),
};

const FacultyAPI = {
  register: (body) => apiFetch('/faculty/register', { method: 'POST', body }),
  login: (body) => apiFetch('/faculty/login', { method: 'POST', body }),
  logout: () => apiFetch('/faculty/logout', { method: 'POST' }),
  getProfile: () => apiFetch('/faculty/profile'),
  updateProfile: (body) => apiFetch('/faculty/profile', { method: 'PUT', body }),
  getStudents: (page = 1, limit = 10) => apiFetch(`/faculty/students?page=${page}&limit=${limit}`),
  searchStudents: (q) => apiFetch(`/faculty/students/search?q=${encodeURIComponent(q)}`),
};

const AdminAPI = {
  login: (body) => apiFetch('/admin/login', { method: 'POST', body }),
  logout: () => apiFetch('/admin/logout', { method: 'POST' }),
  getProfile: () => apiFetch('/admin/profile'),
  getSummary: () => apiFetch('/admin/summary'),
  getFaculty: () => apiFetch('/admin/faculty'),
  setLibrarian: (employeeId, is_librarian) => apiFetch(`/admin/faculty/${employeeId}/librarian`, {
    method: 'PATCH',
    body: { is_librarian },
  }),
  getRequests: (status = 'all') => apiFetch(`/admin/requests?status=${encodeURIComponent(status)}`),
  decideRequest: (requestId, body) => apiFetch(`/admin/requests/${requestId}`, {
    method: 'PATCH',
    body,
  }),
};

const BookAPI = {
  list: ({ page = 1, limit = 8, search = '', sortBy = 'title', sortDir = 'ASC' } = {}) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sortBy,
      sortDir,
    });

    if (search) {
      params.set('search', search);
    }

    return apiFetch(`/books?${params.toString()}`);
  },
  create: (body) => apiFetch('/books', { method: 'POST', body }),
  update: (bookId, body) => apiFetch(`/books/${bookId}`, { method: 'PUT', body }),
  remove: (bookId) => apiFetch(`/books/${bookId}`, { method: 'DELETE' }),
};

const LibraryAPI = {
  getMyRequests: () => apiFetch('/library/requests/mine'),
  requestBook: (body) => apiFetch('/library/requests', { method: 'POST', body }),
};

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn()) {
    return;
  }

  const role = Auth.getRole();
  const navbarUser = document.querySelector('.navbar-user');
  const currentPage = window.location.pathname.toLowerCase();

  if (!navbarUser || !['student', 'faculty'].includes(role)) {
    return;
  }

  if (!currentPage.endsWith('/student-dashboard.html') && !currentPage.endsWith('/faculty-dashboard.html')) {
    return;
  }

  if (document.getElementById('libraryNavLink')) {
    return;
  }

  const link = document.createElement('a');
  link.id = 'libraryNavLink';
  link.href = '/library-catalog.html';
  link.className = 'btn btn-sm nav-action-btn';
  link.textContent = 'Library Catalog';
  navbarUser.insertBefore(link, navbarUser.firstChild);
});

window.Auth = Auth;
window.StudentAPI = StudentAPI;
window.FacultyAPI = FacultyAPI;
window.AdminAPI = AdminAPI;
window.BookAPI = BookAPI;
window.LibraryAPI = LibraryAPI;
