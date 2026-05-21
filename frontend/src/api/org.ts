import api from './client';
import { Organisation, User, InviteToken } from '../types';

export const orgApi = {
  get: () => api.get<Organisation>('/org').then((r) => r.data),
  update: (data: Partial<Organisation>) => api.put<Organisation>('/org', data).then((r) => r.data),
  getUsers: () => api.get<{ users: User[]; pendingInvites: InviteToken[] }>('/org/users').then((r) => r.data),
  updateRole: (userId: string, role: string) =>
    api.put(`/org/users/${userId}/role`, { role }).then((r) => r.data),
  removeUser: (userId: string) => api.delete(`/org/users/${userId}`).then((r) => r.data),
  revokeInvite: (inviteId: string) => api.delete(`/org/invites/${inviteId}`).then((r) => r.data),
};

export const profileApi = {
  get: () => api.get<User>('/profile').then((r) => r.data),
  update: (data: Partial<User>) => api.put<User>('/profile', data).then((r) => r.data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/profile/password', data).then((r) => r.data),
};
