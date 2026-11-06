import { api } from './client.js';

// M1-C Surplus food: every write call (pages read with useFetch on the same paths).
export const surplusApi = {
  createListing: (listing) => api.post('/surplus', listing),
  updateListing: (id, body) => api.patch(`/surplus/${id}`, body),
  cancelListing: (id, reason) => api.post(`/surplus/${id}/cancel`, { reason }),

  createRequest: (request) => api.post('/food-requests', request),
  updateRequest: (id, request) => api.patch(`/food-requests/${id}`, request),
  cancelRequest: (id, reason) => api.post(`/food-requests/${id}/cancel`, { reason }),

  // idempotencyKey: one random id per click, so a double-click can't reserve twice
  reserve: (body, idempotencyKey) => api.post('/reservations', body, { idempotencyKey }),
  cancelReservation: (id, reason) => api.post(`/reservations/${id}/cancel`, { reason }),
};

// A new random id for an Idempotency-Key header.
export function newIdempotencyKey() {
  return crypto.randomUUID();
}
