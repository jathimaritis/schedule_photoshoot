import api from './client';
import { Project, PhotographyType, ShootingDay, ShotSection, CallSheet, CallSheetField, WeatherData } from '../types';

export const projectsApi = {
  list: (status?: string) =>
    api.get<Project[]>('/projects', { params: status ? { status } : {} }).then((r) => r.data),

  create: (data: Partial<Project>) =>
    api.post<Project>('/projects', data).then((r) => r.data),

  get: (id: string) =>
    api.get<Project>(`/projects/${id}`).then((r) => r.data),

  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/projects/${id}`).then((r) => r.data),

  duplicate: (id: string) =>
    api.post<Project>(`/projects/${id}/duplicate`).then((r) => r.data),

  // Photography types
  getTypes: (id: string) =>
    api.get<PhotographyType[]>(`/projects/${id}/types`).then((r) => r.data),
  createType: (id: string, data: Partial<PhotographyType>) =>
    api.post<PhotographyType>(`/projects/${id}/types`, data).then((r) => r.data),
  updateType: (id: string, typeId: string, data: Partial<PhotographyType>) =>
    api.put<PhotographyType>(`/projects/${id}/types/${typeId}`, data).then((r) => r.data),
  deleteType: (id: string, typeId: string) =>
    api.delete(`/projects/${id}/types/${typeId}`).then((r) => r.data),

  // Shooting days
  getDays: (id: string) =>
    api.get<ShootingDay[]>(`/projects/${id}/days`).then((r) => r.data),
  createDay: (id: string, data: Partial<ShootingDay>) =>
    api.post<ShootingDay>(`/projects/${id}/days`, data).then((r) => r.data),
  bulkCreateDays: (id: string, days: Partial<ShootingDay>[]) =>
    api.post<ShootingDay[]>(`/projects/${id}/days/bulk`, { days }).then((r) => r.data),
  updateDay: (id: string, dayId: string, data: Partial<ShootingDay>) =>
    api.put<ShootingDay>(`/projects/${id}/days/${dayId}`, data).then((r) => r.data),
  deleteDay: (id: string, dayId: string) =>
    api.delete(`/projects/${id}/days/${dayId}`).then((r) => r.data),

  // Shots
  getShots: (id: string) =>
    api.get<ShotSection[]>(`/projects/${id}/shots`).then((r) => r.data),
  importShots: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/projects/${id}/shots/import`, form).then((r) => r.data);
  },

  createSection: (id: string, data: { name: string; sortOrder?: number; photographyTypeId?: string | null }) =>
    api.post(`/projects/${id}/shots/sections`, data).then((r) => r.data),
  updateSection: (id: string, sectionId: string, data: Partial<{ name: string; sortOrder: number; photographyTypeId: string | null }>) =>
    api.put(`/projects/${id}/shots/sections/${sectionId}`, data).then((r) => r.data),
  deleteSection: (id: string, sectionId: string) =>
    api.delete(`/projects/${id}/shots/sections/${sectionId}`).then((r) => r.data),

  createCategory: (id: string, data: object) =>
    api.post(`/projects/${id}/shots/categories`, data).then((r) => r.data),
  updateCategory: (id: string, catId: string, data: object) =>
    api.put(`/projects/${id}/shots/categories/${catId}`, data).then((r) => r.data),
  deleteCategory: (id: string, catId: string) =>
    api.delete(`/projects/${id}/shots/categories/${catId}`).then((r) => r.data),

  createLocation: (id: string, data: object) =>
    api.post(`/projects/${id}/shots/locations`, data).then((r) => r.data),
  updateLocation: (id: string, locId: string, data: object) =>
    api.put(`/projects/${id}/shots/locations/${locId}`, data).then((r) => r.data),
  deleteLocation: (id: string, locId: string) =>
    api.delete(`/projects/${id}/shots/locations/${locId}`).then((r) => r.data),

  createShot: (id: string, data: object) =>
    api.post(`/projects/${id}/shots/shots-item`, data).then((r) => r.data),
  updateShot: (id: string, shotId: string, data: object) =>
    api.put(`/projects/${id}/shots/shots-item/${shotId}`, data).then((r) => r.data),
  deleteShot: (id: string, shotId: string) =>
    api.delete(`/projects/${id}/shots/shots-item/${shotId}`).then((r) => r.data),
  reorderShot: (id: string, shotId: string, sortOrder: number) =>
    api.post(`/projects/${id}/shots/shots-item/${shotId}/reorder`, { sortOrder }).then((r) => r.data),

  createAssignment: (id: string, data: { shotId: string; shootingDayId: string; tickColour?: string }) =>
    api.post(`/projects/${id}/shots/assignments`, data).then((r) => r.data),
  deleteAssignment: (id: string, assignmentId: string) =>
    api.delete(`/projects/${id}/shots/assignments/${assignmentId}`).then((r) => r.data),

  // Call sheets
  getCallSheets: (id: string) =>
    api.get<CallSheet[]>(`/projects/${id}/callsheets`).then((r) => r.data),
  generateCallSheets: (id: string) =>
    api.post(`/projects/${id}/callsheets/generate`).then((r) => r.data),
  getCallSheet: (id: string, dayId: string) =>
    api.get<CallSheet>(`/projects/${id}/callsheets/${dayId}`).then((r) => r.data),
  updateCallSheet: (id: string, dayId: string, data: {
    notes?: string | null; isLocked?: boolean;
    location?: string | null; locationLat?: number | null; locationLng?: number | null;
    sunrise?: string | null; sunset?: string | null;
    goldenHourAm?: string | null; goldenHourPm?: string | null;
    blueHourAm?: string | null; blueHourPm?: string | null;
    weatherData?: WeatherData | null;
  }) =>
    api.put<CallSheet>(`/projects/${id}/callsheets/${dayId}`, data).then((r) => r.data),
  updateCallSheetFields: (id: string, dayId: string, fields: Partial<CallSheetField>[]) =>
    api.put(`/projects/${id}/callsheets/${dayId}/fields`, { fields }).then((r) => r.data),
  reorderCallSheetShots: (id: string, dayId: string, shots: { id: string; sortOrder: number }[]) =>
    api.put(`/projects/${id}/callsheets/${dayId}/shots/reorder`, { shots }).then((r) => r.data),
};

export const exportApi = {
  scheduleUrl: (id: string) => `/projects/${id}/export/schedule.xlsx`,
  callSheetsUrl: (id: string) => `/projects/${id}/export/callsheets.xlsx`,
  callSheetUrl: (id: string, dayId: string) => `/projects/${id}/export/callsheet/${dayId}.xlsx`,
};
