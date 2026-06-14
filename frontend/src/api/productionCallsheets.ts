import api from './client';
import { ProductionCallSheet, ProductionShot, WeatherData } from '../types';

export interface SunTimesResponse {
  sunrise: string | null;
  sunset: string | null;
  goldenHourAm: string | null;
  goldenHourPm: string | null;
  blueHourAm: string | null;
  blueHourPm: string | null;
  weather: WeatherData;
}

export const productionCsApi = {
  list: () =>
    api.get<(ProductionCallSheet & { _count: { shots: number } })[]>('/production-callsheets').then((r) => r.data),

  create: (data: Partial<ProductionCallSheet>) =>
    api.post<ProductionCallSheet>('/production-callsheets', data).then((r) => r.data),

  get: (id: string) =>
    api.get<ProductionCallSheet>(`/production-callsheets/${id}`).then((r) => r.data),

  update: (id: string, data: Partial<ProductionCallSheet>) =>
    api.put<ProductionCallSheet>(`/production-callsheets/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/production-callsheets/${id}`).then((r) => r.data),

  addShot: (id: string, data: Partial<ProductionShot>) =>
    api.post<ProductionShot>(`/production-callsheets/${id}/shots`, data).then((r) => r.data),

  updateShot: (id: string, shotId: string, data: Partial<ProductionShot>) =>
    api.put<ProductionShot>(`/production-callsheets/${id}/shots/${shotId}`, data).then((r) => r.data),

  deleteShot: (id: string, shotId: string) =>
    api.delete(`/production-callsheets/${id}/shots/${shotId}`).then((r) => r.data),

  importShots: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ imported: number }>(`/production-callsheets/${id}/import-shots`, form).then((r) => r.data);
  },

  exportExcelUrl: (id: string) => `/production-callsheets/${id}/export/excel`,
  exportPdfUrl: (id: string) => `/production-callsheets/${id}/export/pdf`,

  fetchSunTimes: (location: string, date: string) =>
    api.get<SunTimesResponse>('/production-callsheets/sun-times', { params: { location, date } }).then((r) => r.data),
};
