import { api } from './client.js';

// M2-A Expenses and contributions + the shared sandbox checkout.
export const moneyApi = {
  addExpense: (eventId, expense) => api.post(`/events/${eventId}/expenses`, expense),
  updateExpense: (id, expense) => api.patch(`/expenses/${id}`, expense),
  voidExpense: (id, reason) => api.post(`/expenses/${id}/void`, { reason }),

  saveSplit: (eventId, split) => api.put(`/events/${eventId}/split`, split),

  addContribution: (eventId, contribution) => api.post(`/events/${eventId}/contributions`, contribution),
  updateContribution: (id, contribution) => api.patch(`/contributions/${id}`, contribution),
  receive: (id, body) => api.post(`/contributions/${id}/receive`, body),
  checkout: (id, amount) => api.post(`/contributions/${id}/checkout`, { amount }),
  setFulfilment: (id, body) => api.patch(`/contributions/${id}/fulfilment`, body),
  cancelContribution: (id, reason) => api.post(`/contributions/${id}/cancel`, { reason }),

  verifyPayment: (tranId) => api.post(`/payments/${encodeURIComponent(tranId)}/verify`),
};
