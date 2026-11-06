import { api } from './client.js';

// M2-C Collection logistics + Telegram.
export const collectionApi = {
  assign: (reservationId, body, idempotencyKey) => api.post(`/reservations/${reservationId}/tasks`, body, { idempotencyKey }),
  setStatus: (taskId, body) => api.patch(`/tasks/${taskId}/status`, body),
  sendReminders: () => api.post('/tasks/reminders/send-due'),
  retryTelegram: (notificationId) => api.post(`/notifications/${notificationId}/retry`),

  telegramLink: () => api.post('/telegram/link'),
  telegramVerify: () => api.post('/telegram/verify'),
  telegramUnlink: () => api.delete('/telegram/link'),
};
