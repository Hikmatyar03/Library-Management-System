const activeLibraryRole = Auth.getRole();

if (!Auth.isLoggedIn() || !['student', 'faculty'].includes(activeLibraryRole)) {
  window.location.href = activeLibraryRole === 'library_admin'
    ? 'library-admin-login.html'
    : activeLibraryRole === 'faculty'
      ? 'faculty-login.html'
      : 'student-login.html';
}

const LIBRARY_PAGE_LIMIT = 8;
let libraryPage = 1;
let librarySearch = '';
let librarySortBy = 'title';
let librarySortDir = 'ASC';
let libraryRequests = [];
let librarySearchTimer = null;

function catalogToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = `show toast-${type}`;
  toast.textContent = msg;
  setTimeout(() => {
    toast.className = '';
  }, 3200);
}

function catalogEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function catalogDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function catalogBadge(status) {
  const safe = catalogEscape(status);
  return `<span class="request-badge ${safe}">${safe}</span>`;
}

function activeRequestMap() {
  const map = new Map();
  libraryRequests.forEach((request) => {
    if (request.status === 'pending' || request.status === 'approved') {
      map.set(request.book_id, request.status);
    }
  });
  return map;
}

function renderCatalogSummary(bookSummary = {}) {
  const pendingCount = libraryRequests.filter((request) => request.status === 'pending').length;
  const approvedCount = libraryRequests.filter((request) => request.status === 'approved').length;
  document.getElementById('summaryBooks').textContent = bookSummary.totalBooks || 0;
  document.getElementById('summaryAvailable').textContent = bookSummary.availableCopies || 0;
  document.getElementById('summaryPending').textContent = pendingCount;
  document.getElementById('summaryApproved').textContent = approvedCount;
}

function renderCatalogCaption(total, search) {
  const caption = document.getElementById('catalogCaption');
  caption.textContent = search
    ? `${total} result${total === 1 ? '' : 's'} for "${search}"`
    : `${total} book record${total === 1 ? '' : 's'} in the catalog`;
}

function renderCatalogPagination(pagination) {
  const wrap = document.getElementById('paginationWrap');
  const totalPages = pagination.totalPages || 0;
  if (totalPages <= 1) {
    wrap.innerHTML = pagination.total ? `<span class="page-info">${pagination.total} total record${pagination.total === 1 ? '' : 's'}</span>` : '';
    return;
  }

  let html = `<button class="page-btn" ${pagination.page === 1 ? 'disabled' : ''} onclick="goPage(${pagination.page - 1})">Prev</button>`;
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1 || page === totalPages || Math.abs(page - pagination.page) <= 1) {
      html += `<button class="page-btn ${page === pagination.page ? 'active' : ''}" onclick="goPage(${page})">${page}</button>`;
    }
  }
  html += `<button class="page-btn" ${pagination.page === totalPages ? 'disabled' : ''} onclick="goPage(${pagination.page + 1})">Next</button>`;
  html += `<span class="page-info">${pagination.total} total record${pagination.total === 1 ? '' : 's'}</span>`;
  wrap.innerHTML = html;
}

function renderLibraryRequests() {
  const body = document.getElementById('requestTableBody');
  if (!libraryRequests.length) {
    body.innerHTML = '<tr><td colspan="5" class="table-empty">You have not requested any books yet.</td></tr>';
    return;
  }

  body.innerHTML = libraryRequests.map((request) => `
    <tr>
      <td>#${request.request_id}</td>
      <td>
        <div class="book-title-cell">
          <strong>${catalogEscape(request.title)}</strong>
          <span>${catalogEscape(request.isbn)}</span>
        </div>
      </td>
      <td>${catalogBadge(request.status)}</td>
      <td>${catalogDate(request.requested_at)}</td>
      <td>${catalogEscape(request.admin_note || request.request_note || '-')}</td>
    </tr>
  `).join('');
}

function renderCatalogBooks(books) {
  const activeRequests = activeRequestMap();
  const body = document.getElementById('bookTableBody');
  if (!books.length) {
    body.innerHTML = '<tr><td colspan="7" class="table-empty">No books found for the current filters.</td></tr>';
    return;
  }

  body.innerHTML = books.map((book) => {
    const status = activeRequests.get(book.book_id);
    const unavailable = book.available <= 0;
    const disabled = Boolean(status) || unavailable;
    const label = status === 'pending'
      ? 'Pending Approval'
      : status === 'approved'
        ? 'Approved'
        : unavailable
          ? 'Unavailable'
          : 'Request Book';

    return `
      <tr>
        <td>${book.book_id}</td>
        <td>
          <div class="book-title-cell">
            <strong>${catalogEscape(book.title)}</strong>
            <span>${catalogEscape(book.publisher)}</span>
          </div>
        </td>
        <td>${catalogEscape(book.author)}</td>
        <td>${catalogEscape(book.category)}</td>
        <td>${catalogEscape(book.isbn)}</td>
        <td><span class="status-pill ${book.available > 0 ? 'available' : 'limited'}">${book.available}</span></td>
        <td>
          <button type="button" class="btn ${disabled ? 'btn-outline' : 'btn-secondary'} btn-sm"
            ${disabled ? 'disabled' : ''} onclick="requestBook(${book.book_id})">${label}</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadLibraryProfile() {
  const role = Auth.getRole();
  const backLink = document.getElementById('backLink');
  backLink.href = role === 'faculty' ? 'faculty-dashboard.html' : 'student-dashboard.html';
  backLink.textContent = role === 'faculty' ? 'Back to Faculty Dashboard' : 'Back to Student Dashboard';
  const res = role === 'faculty' ? await FacultyAPI.getProfile() : await StudentAPI.getProfile();
  if (res && res.ok) document.getElementById('navName').textContent = res.data.full_name;
}

async function loadLibraryRequests() {
  const body = document.getElementById('requestTableBody');
  body.innerHTML = '<tr><td colspan="5" class="table-empty">Loading requests...</td></tr>';
  const res = await LibraryAPI.getMyRequests();
  if (!res || !res.ok) {
    body.innerHTML = '<tr><td colspan="5" class="table-empty">Failed to load your requests.</td></tr>';
    return;
  }
  libraryRequests = res.data.requests;
  renderLibraryRequests();
}

async function loadLibraryBooks(page = libraryPage) {
  libraryPage = page;
  const body = document.getElementById('bookTableBody');
  body.innerHTML = '<tr><td colspan="7" class="table-empty">Loading books...</td></tr>';
  const res = await BookAPI.list({ page, limit: LIBRARY_PAGE_LIMIT, search: librarySearch, sortBy: librarySortBy, sortDir: librarySortDir });
  if (!res || !res.ok) {
    body.innerHTML = '<tr><td colspan="7" class="table-empty">Failed to load books.</td></tr>';
    renderCatalogPagination({ total: 0, totalPages: 0, page: 1 });
    renderCatalogCaption(0, librarySearch);
    return;
  }

  renderCatalogBooks(res.data.books);
  renderCatalogPagination(res.data.pagination);
  renderCatalogCaption(res.data.pagination.total, librarySearch);
  renderCatalogSummary(res.data.summary);
}

async function requestBook(bookId) {
  const res = await LibraryAPI.requestBook({ book_id: bookId });
  if (!res || !res.ok) return catalogToast((res && res.data.error) || 'Failed to submit your request.', 'error');
  await loadLibraryRequests();
  await loadLibraryBooks(libraryPage);
  catalogToast('Book request submitted for library admin approval.');
}

function goPage(page) {
  loadLibraryBooks(page);
}

function clearFilters() {
  librarySearch = '';
  librarySortBy = 'title';
  librarySortDir = 'ASC';
  libraryPage = 1;
  document.getElementById('searchInput').value = '';
  document.getElementById('sortBy').value = librarySortBy;
  document.getElementById('sortDir').value = librarySortDir;
  loadLibraryBooks(1);
}

async function doLogout() {
  if (Auth.getRole() === 'faculty') {
    await FacultyAPI.logout().catch(() => {});
    Auth.clearSession();
    window.location.href = 'faculty-login.html';
    return;
  }
  await StudentAPI.logout().catch(() => {});
  Auth.clearSession();
  window.location.href = 'student-login.html';
}

document.getElementById('searchInput').addEventListener('input', (event) => {
  clearTimeout(librarySearchTimer);
  librarySearch = event.target.value.trim();
  librarySearchTimer = setTimeout(() => loadLibraryBooks(1), 300);
});

document.getElementById('sortBy').addEventListener('change', (event) => {
  librarySortBy = event.target.value;
  loadLibraryBooks(1);
});

document.getElementById('sortDir').addEventListener('change', (event) => {
  librarySortDir = event.target.value;
  loadLibraryBooks(1);
});

(async function init() {
  await loadLibraryProfile();
  await loadLibraryRequests();
  await loadLibraryBooks(1);
})();
