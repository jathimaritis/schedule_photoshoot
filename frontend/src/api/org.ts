import api from './client';
import { Organisation, User, InviteToken, ModuleAccess } from '../types';

export const orgApi = {
  get: () => api.get<Organisation>('/org').then((r) => r.data),
  update: (data: Partial<Organisation>) => api.put<Organisation>('/org', data).then((r) => r.data),
  getUsers: () =>
    api.get<{ users: User[]; invites: InviteToken[] }>('/org/users').then((r) => r.data),
  updateModuleAccess: (userId: string, moduleAccess: ModuleAccess) =>
    api.put(`/org/users/${userId}/module-access`, { moduleAccess }).then((r) => r.data),
  setActive: (userId: string, isActive: boolean) =>
    api.put(`/org/users/${userId}/active`, { isActive }).then((r) => r.data),
  removeUser: (userId: string) =>
    api.delete(`/org/users/${userId}`).then((r) => r.data),
  cancelInvite: (inviteId: string) =>
    api.delete(`/org/invites/${inviteId}`).then((r) => r.data),
  deleteExpiredInvites: () =>
    api.delete('/org/invites').then((r) => r.data as { count: number }),
};

export const profileApi = {
  get: () => api.get<User>('/profile').then((r) => r.data),
  update: (data: Partial<User>) => api.put<User>('/profile', data).then((r) => r.data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/profile/password', data).then((r) => r.data),
};
