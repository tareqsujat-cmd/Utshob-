// The one place where the React app talks to the server.
// Every request adds the login token; every error becomes an ApiError with the server's message.

const BASE_URL = import.meta.env.VITE_API_URL || ''; // empty in dev: Vite proxies /api
const TOKEN_KEY = 'utshob_token';

// localStorage can throw (private mode, blocked storage), so every access is wrapped.
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore: user stays logged in until the page reloads */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message, status, details, data) {
    super(message);
    this.status = status; // HTTP status, or 0 if the server could not be reached
    this.details = details; // [{ field, message }] for validation errors
    this.data = data; // full error body, e.g. { upgradeTo: 'plus' }
  }
}

async function request(method, path, body, options = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const isFormData = body instanceof FormData; // file uploads
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status, data.details, data);
  }
  return data;
}

export const api = {
  get: (path, options) => request('GET', path, null, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  delete: (path, options) => request('DELETE', path, null, options),
};

// Opens a protected file (e.g. an uploaded licence) in a new tab.
// A plain <a href> can't send the login token, so we download it with fetch and show the result.
export async function openFile(fileId) {
  const tab = window.open('', '_blank'); // open right away (inside the click) so pop-up blockers allow it
  const response = await fetch(`${BASE_URL}/api/files/${fileId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) {
    tab?.close();
    throw new ApiError('Could not open the file', response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob); // a temporary local address for the downloaded file
  if (tab) tab.location.href = url;
  else window.location.href = url;
}

// Turns [{ field, message }] into { field: message } so forms can show errors under inputs.
export function fieldErrors(error) {
  const result = {};
  for (const detail of error?.details || []) result[detail.field] = detail.message;
  return result;
}
