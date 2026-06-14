import api from './client';
import { AuthResponse } from '../types';

export const authApi = {
  register: (data: { name: string; email: string; password: string; organisationName: string }) =>
    api.post<AuthResponse>('/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  refresh: () => api.post<{ accessToken: string; user?: import('../types').User }>('/auth/refresh').then((r) => r.data),

  invite: (data: { email: string; role: string }) =>
    api.post('/auth/invite', data).then((r) => r.data),

  acceptInvite: (token: string, data: { name: string; password: string }) =>
    api.post<AuthResponse>(`/auth/accept-invite/${token}`, data).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    api.post(`/auth/reset-password/${token}`, { password }).then((r) => r.data),
};
