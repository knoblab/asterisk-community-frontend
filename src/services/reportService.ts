import { useAuthStore } from '../stores/useAuthStore';
import { authFetch } from '../stores/useBoardStore';

const baseUrl = import.meta.env.VITE_API_URL || '';
const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;

export type ReportTarget = 'post' | 'comment';

export interface ReportRecord {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  postId: string;
  postTitle?: string;
  targetAuthor?: string;
  reporterUid?: string;
  reason: string;
  createdAt: number;
}

export const createReport = async (report: Omit<ReportRecord, 'id' | 'createdAt'>): Promise<string> => {
  const currentUser = useAuthStore.getState().user;
  const res = await authFetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    body: JSON.stringify({
      ...report,
      reporterUid: currentUser?.uid || 'anonymous',
    }),
  });

  if (!res.ok) {
    throw new Error(`Report failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.id || 'report-success';
};

export const fetchReports = async (): Promise<ReportRecord[]> => {
  const res = await authFetch(`${API_BASE_URL}/reports`, {
    method: 'GET',
  });

  if (!res.ok) {
    throw new Error(`Failed to load reports: ${res.status}`);
  }

  const data: ReportRecord[] = await res.json();
  return Array.isArray(data) ? data.sort((a, b) => b.createdAt - a.createdAt) : [];
};

export const dismissReport = async (reportId: string): Promise<boolean> => {
  const res = await authFetch(`${API_BASE_URL}/reports/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error(`Failed to dismiss report: ${res.status}`);
  }

  return true;
};
