import { api } from './api';

export async function startBreakApi(breakType: string): Promise<{ id: string; startTime: string }> {
  const res = await api.post<any>('/breaks', { breakType });
  return { id: res.id, startTime: res.startTime };
}

export async function endBreakApi(breakId: string): Promise<void> {
  await api.put(`/breaks/${breakId}/end`, {});
}

export async function getActiveBreakApi(): Promise<{ id: string; breakType: string; startTime: string } | null> {
  return (await api.get<any>('/breaks/active')) ?? null;
}
