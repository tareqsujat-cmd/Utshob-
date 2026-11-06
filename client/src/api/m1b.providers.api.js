import { api } from './client.js';

// M1-B Provider management: every call the provider pages make (reads use useFetch with the same paths).
export const providersApi = {
  saveProfile: (profile) => api.put('/providers/me', profile),
  addPackage: (pkg) => api.post('/providers/me/packages', pkg),
  updatePackage: (packageId, pkg) => api.patch(`/providers/me/packages/${packageId}`, pkg),
  saveBlockedDates: (blockedDates) => api.put('/providers/me/blocked-dates', { blockedDates }),
  uploadCredential: (formData) => api.post('/providers/me/credentials', formData),

  // admin
  reviewCredential: (credentialId, status, note) => api.patch(`/admin/credentials/${credentialId}`, { status, note }),
  runExpiryCheck: () => api.post('/admin/credentials/expiry-check'),
};
