if (!Auth.isLoggedIn() || Auth.getRole() !== 'library_admin') {
  window.location.href = 'library-admin-login.html';
}

const PAGE_LIMIT = 8;
let currentPage = 1;
let currentSearch = '';
let currentSortBy = 'title';
let currentSortDir = 'ASC';
let currentBooks = [];
let searchTimer = null;
let deleteBookId = null;

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = `show toast-${type}`;
  toast.textContent = msg;
  setTimeout(() => {
    toast.className = '';
  }, 3200);
}

function setAlert(id, message) {
  const box = document.getElementById(id);
  if (!message) {
    box.className = 'alert alert-error alert-hidden';
    box.textContent = '';
    return;
  }

  box.className = 'alert alert-error';
  box.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function requestBadge(status, label) {
  const safeStatus = escapeHtml(status);
  const safeLabel = escapeHtml(label || status);
  return `<span class="request-badge ${safeStatus}">${safeLabel}</span>`;
}

function renderSummary(summary = {}) {
  document.getElementById('summaryBooks').textContent = summary.totalBooks || 0;
  document.getElementById('summaryAvailable').textContent = summary.availableCopies || 0;
  document.getElementById('summaryPending').textContent = summary.pendingRequests || 0;
  document.getElementById('summaryLibrarians').textContent = summary.totalLibrarians || 0;
}

function renderCatalogCaption(total, search) {
  const caption = document.getElementById('catalogCaption');
  if (search) {
    caption.textContent = `${total} result${total === 1 ? '' : 's'} for "${search}"`;
    return;
  }

  caption.textContent = `${total} book record${total === 1 ? '' : 's'} in the catalog`;
}

function renderBooks(books) {
  const body = document.getElementById('bookTableBody');
  if (!books.length) {
    body.innerHTML = '<tr><td colspan="9" class="table-empty">No books found for the current filters.</td></tr>';
    return;
  }

  body.innerHTML = books.map((book) => `
    <tr>
      <td>${book.book_id}</td>
      <td>
        <div class="book-title-cell">
          <strong>${escapeHtml(book.title)}</strong>
          <span>${escapeHtml(book.publisher)}</span>
        </div>
      </td>
      <td>${escapeHtml(book.author)}</td>
      <td>${escapeHtml(book.category)}</td>
      <td>${escapeHtml(book.isbn)}</td>
      <td>${book.year}</td>
      <td>${book.quantity}</td>
      <td><span class="status-pill ${book.available > 0 ? 'available' : 'limited'}">${book.available}</span></td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openEditModal(${book.book_id})">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" onclick="openDeleteModal(${book.book_id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderPagination(pagination) {
  const wrap = document.getElementById('paginationWrap');
  const totalPages = pagination.totalPages || 0;

  if (totalPages <= 1) {
    wrap.innerHTML = pagination.total
      ? `<span class="page-info">${pagination.total} total record${pagination.total === 1 ? '' : 's'}</span>`
      : '';
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

function renderRequests(requests) {
  const body = document.getElementById('requestTableBody');
  if (!requests.length) {
    body.innerHTML = '<tr><td colspan="8" class="table-empty">No requests match the current filter.</td></tr>';
    return;
  }

  body.innerHTML = requests.map((request) => `
    <tr>
      <td>#${request.request_id}</td>
      <td>
        <div class="book-title-cell">
          <strong>${escapeHtml(request.requester_name)}</strong>
          <span>${escapeHtml(request.requester_id)}</span>
        </div>
      </td>
      <td style="text-transform:capitalize;">${escapeHtml(request.requester_role)}</td>
      <td>
        <div class="book-title-cell">
          <strong>${escapeHtml(request.title)}</strong>
          <span>${escapeHtml(request.isbn)}</span>
        </div>
      </td>
      <td>${formatDate(request.requested_at)}</td>
      <td>${requestBadge(request.status)}</td>
      <td>${escapeHtml(request.request_note || request.admin_note || '-')}</td>
      <td>
        ${request.status === 'pending'
          ? `<div class="table-actions">
               <button type="button" class="btn btn-secondary btn-sm" onclick="decideRequest(${request.request_id}, 'approve')">Approve</button>
               <button type="button" class="btn btn-danger btn-sm" onclick="decideRequest(${request.request_id}, 'reject')">Reject</button>
             </div>`
          : `<span class="text-muted">${request.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}
      </td>
    </tr>
  `).join('');
}

function renderFacultyRows(facultyList) {
  const body = document.getElementById('facultyTableBody');
  if (!facultyList.length) {
    body.innerHTML = '<tr><td colspan="6" class="table-empty">No faculty records found.</td></tr>';
    return;
  }

  body.innerHTML = facultyList.map((member) => `
    <tr>
      <td>${escapeHtml(member.employee_id)}</td>
      <td>${escapeHtml(member.full_name)}</td>
      <td>${escapeHtml(member.department)}</td>
      <td>${escapeHtml(member.designation)}</td>
      <td>${member.is_librarian ? requestBadge('approved', 'Librarian') : requestBadge('rejected', 'Not Librarian')}</td>
      <td>
        <button type="button" class="btn ${member.is_librarian ? 'btn-outline' : 'btn-secondary'} btn-sm"
          onclick="toggleLibrarian('${escapeHtml(member.employee_id)}', ${member.is_librarian ? 'true' : 'false'})">
          ${member.is_librarian ? 'Remove Librarian' : 'Assign Librarian'}
        </button>
      </td>
    </tr>
  `).join('');
}

async function loadProfile() {
  const res = await AdminAPI.getProfile();
  if (res && res.ok) {
    document.getElementById('navName').textContent = res.data.full_name;
    return;
  }
  showToast('Unable to load library admin profile.', 'error');
}

async function loadSummary() {
  const res = await AdminAPI.getSummary();
  if (res && res.ok) {
    renderSummary(res.data);
  }
}

async function loadBooks(page = currentPage) {
  currentPage = page;
  const body = document.getElementById('bookTableBody');
  body.innerHTML = '<tr><td colspan="9" class="table-empty">Loading books...</td></tr>';

  const res = await BookAPI.list({ page, limit: PAGE_LIMIT, search: currentSearch, sortBy: currentSortBy, sortDir: currentSortDir });
  if (!res || !res.ok) {
    body.innerHTML = '<tr><td colspan="9" class="table-empty">Failed to load books.</td></tr>';
    renderPagination({ total: 0, totalPages: 0, page: 1 });
    renderCatalogCaption(0, currentSearch);
    return;
  }

  currentBooks = res.data.books;
  renderBooks(res.data.books);
  renderPagination(res.data.pagination);
  renderCatalogCaption(res.data.pagination.total, currentSearch);
}

async function loadRequests() {
  const body = document.getElementById('requestTableBody');
  body.innerHTML = '<tr><td colspan="8" class="table-empty">Loading requests...</td></tr>';
  const status = document.getElementById('requestStatusFilter').value;
  const res = await AdminAPI.getRequests(status);
  body.innerHTML = res && res.ok
    ? ''
    : '<tr><td colspan="8" class="table-empty">Failed to load requests.</td></tr>';
  if (res && res.ok) renderRequests(res.data.requests);
}

async function loadFaculty() {
  const body = document.getElementById('facultyTableBody');
  body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading faculty...</td></tr>';
  const res = await AdminAPI.getFaculty();
  body.innerHTML = res && res.ok
    ? ''
    : '<tr><td colspan="6" class="table-empty">Failed to load faculty.</td></tr>';
  if (res && res.ok) renderFacultyRows(res.data.faculty);
}

function collectBookForm(mode) {
  const base = mode === 'edit' ? 'editBook' : 'book';
  return {
    title: document.getElementById(`${base}Title`).value.trim(),
    author: document.getElementById(`${base}Author`).value.trim(),
    category: document.getElementById(`${base}Category`).value.trim(),
    isbn: document.getElementById(`${base}Isbn`).value.trim(),
    publisher: document.getElementById(`${base}Publisher`).value.trim(),
    year: document.getElementById(`${base}Year`).value,
    quantity: document.getElementById(`${base}Quantity`).value,
  };
}

function validateBookPayload(book) {
  if (!book.title || !book.author || !book.category || !book.isbn || !book.publisher || !book.year || book.quantity === '') {
    return 'Please fill in all book fields.';
  }
  if (Number(book.year) < 1000) return 'Please provide a valid publication year.';
  if (Number(book.quantity) < 0) return 'Quantity cannot be negative.';
  return '';
}

function openEditModal(bookId) {
  const book = currentBooks.find((item) => item.book_id === bookId);
  if (!book) return showToast('Unable to find that book in the current list.', 'error');
  document.getElementById('editBookId').value = book.book_id;
  document.getElementById('editBookTitle').value = book.title;
  document.getElementById('editBookAuthor').value = book.author;
  document.getElementById('editBookCategory').value = book.category;
  document.getElementById('editBookIsbn').value = book.isbn;
  document.getElementById('editBookPublisher').value = book.publisher;
  document.getElementById('editBookYear').value = book.year;
  document.getElementById('editBookQuantity').value = book.quantity;
  setAlert('editAlert', '');
  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
  setAlert('editAlert', '');
}

function openDeleteModal(bookId) {
  const book = currentBooks.find((item) => item.book_id === bookId);
  deleteBookId = bookId;
  document.getElementById('deleteMessage').textContent = `Are you sure you want to delete "${book ? book.title : 'this book'}" from the catalog?`;
  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  deleteBookId = null;
  document.getElementById('deleteModal').classList.remove('active');
}

async function decideRequest(requestId, action) {
  const res = await AdminAPI.decideRequest(requestId, { action });
  if (!res || !res.ok) return showToast((res && res.data.error) || 'Failed to update request.', 'error');
  await loadRequests();
  await loadBooks(currentPage);
  await loadSummary();
  showToast(action === 'approve' ? 'Request approved.' : 'Request rejected.');
}

async function toggleLibrarian(employeeId, currentlyAssigned) {
  const res = await AdminAPI.setLibrarian(employeeId, !currentlyAssigned);
  if (!res || !res.ok) return showToast((res && res.data.error) || 'Failed to update librarian assignment.', 'error');
  await loadFaculty();
  await loadSummary();
  showToast(!currentlyAssigned ? 'Faculty member assigned as librarian.' : 'Librarian assignment removed.');
}

function goPage(page) {
  loadBooks(page);
}

function clearFilters() {
  currentSearch = '';
  currentSortBy = 'title';
  currentSortDir = 'ASC';
  currentPage = 1;
  document.getElementById('searchInput').value = '';
  document.getElementById('sortBy').value = currentSortBy;
  document.getElementById('sortDir').value = currentSortDir;
  loadBooks(1);
}

async function doLogout() {
  await AdminAPI.logout().catch(() => {});
  Auth.clearSession();
  window.location.href = 'library-admin-login.html';
}

document.getElementById('addBookForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = collectBookForm();
  const validationError = validateBookPayload(payload);
  if (validationError) return setAlert('addAlert', validationError);

  setAlert('addAlert', '');
  const button = document.getElementById('addBookBtn');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Saving...';
  const res = await BookAPI.create(payload);
  button.disabled = false;
  button.textContent = 'Save Book';
  if (!res || !res.ok) return setAlert('addAlert', (res && res.data.error) || 'Failed to save the book.');

  document.getElementById('addBookForm').reset();
  currentSearch = '';
  currentPage = 1;
  document.getElementById('searchInput').value = '';
  await loadBooks(1);
  await loadSummary();
  showToast('Book saved to the catalog.');
});

document.getElementById('editBookForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const bookId = document.getElementById('editBookId').value;
  const payload = collectBookForm('edit');
  const validationError = validateBookPayload(payload);
  if (validationError) return setAlert('editAlert', validationError);

  const button = document.getElementById('editBookBtn');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Saving...';
  const res = await BookAPI.update(bookId, payload);
  button.disabled = false;
  button.textContent = 'Save Changes';
  if (!res || !res.ok) return setAlert('editAlert', (res && res.data.error) || 'Failed to update the book.');

  closeEditModal();
  await loadBooks(currentPage);
  await loadSummary();
  showToast('Book updated successfully.');
});

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!deleteBookId) return;
  const res = await BookAPI.remove(deleteBookId);
  if (!res || !res.ok) return showToast((res && res.data.error) || 'Failed to delete the book.', 'error');

  closeDeleteModal();
  const nextPage = currentBooks.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
  await loadBooks(nextPage);
  await loadRequests();
  await loadSummary();
  showToast('Book deleted successfully.');
});

document.getElementById('searchInput').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  currentSearch = event.target.value.trim();
  searchTimer = setTimeout(() => loadBooks(1), 300);
});

document.getElementById('sortBy').addEventListener('change', (event) => {
  currentSortBy = event.target.value;
  loadBooks(1);
});

document.getElementById('sortDir').addEventListener('change', (event) => {
  currentSortDir = event.target.value;
  loadBooks(1);
});

document.getElementById('requestStatusFilter').addEventListener('change', loadRequests);

window.addEventListener('click', (event) => {
  if (event.target.id === 'editModal') closeEditModal();
  if (event.target.id === 'deleteModal') closeDeleteModal();
});

(async function init() {
  await loadProfile();
  await loadSummary();
  await loadBooks(1);
  await loadRequests();
  await loadFaculty();
})();
