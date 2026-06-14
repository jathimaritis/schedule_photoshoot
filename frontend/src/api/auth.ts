import api from './client';
import { AuthResponse, ModuleAccess } from '../types';

export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  refresh: () => api.post<{ accessToken: string; user?: import('../types').User }>('/auth/refresh').then((r) => r.data),

  invite: (data: { email: string; moduleAccess: ModuleAccess }) =>
    api.post<{ message: string; email: string; inviteUrl: string }>('/auth/invite', data).then((r) => r.data),

  getInvite: (token: string) =>
    api.get<{ email: string; moduleAccess: ModuleAccess }>(`/auth/invite/${token}`).then((r) => r.data),

  acceptInvite: (token: string, data: { name: string; password: string }) =>
    api.post<AuthResponse>(`/auth/invite/${token}`, data).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    api.post(`/auth/reset-password/${token}`, { password }).then((r) => r.data),
};
