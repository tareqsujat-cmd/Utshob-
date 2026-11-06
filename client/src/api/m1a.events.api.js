import { api } from './client.js';

// M1-A Event management: every write call (pages read with useFetch on the same paths).
export const eventsApi = {
  create: (event) => api.post('/events', event),
  update: (id, changes) => api.patch(`/events/${id}`, changes),
  markPlanned: (id) => api.post(`/events/${id}/plan`),
  markCompleted: (id) => api.post(`/events/${id}/complete`),
  copy: (id, body) => api.post(`/events/${id}/copy`, body),
  cancel: (id, reason) => api.post(`/events/${id}/cancel`, { reason }),
  reschedule: (id, body) => api.post(`/events/${id}/reschedule`, body),
  setOrganizers: (id, emails) => api.put(`/events/${id}/organizers`, { emails }),

  createScenario: (id, body) => api.post(`/events/${id}/budgets`, body),
  saveBudget: (budgetId, body) => api.patch(`/budgets/${budgetId}`, body),
  makePrimary: (budgetId) => api.patch(`/budgets/${budgetId}/primary`),

  saveInvitation: (id, body) => api.put(`/events/${id}/invitation`, body),
  submitRsvp: (slug, body) => api.post(`/public/invitations/${slug}/rsvp`, body),

  saveMenu: (id, body) => api.put(`/events/${id}/menu`, body),
  addBatch: (id, body) => api.post(`/events/${id}/batches`, body),
  setBatchStatus: (batchId, status) => api.patch(`/batches/${batchId}/status`, { status }),
  suggestFoodPlan: (id, attendance) => api.post(`/events/${id}/food-plan/suggest`, { attendance }),
  applyFoodPlan: (id, body) => api.post(`/events/${id}/food-plan/apply`, body),
};
