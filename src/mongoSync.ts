import { AppState, LogEntry, MonthData } from './types';

const API_BASE = '/api';

export type DbStatus = {
  hasMongoUriEnv: boolean;
  isMongoConnected: boolean;
  storageType: 'mongodb' | 'local_json';
};

// Check integration system status and database backend links
export async function fetchDbStatus(): Promise<DbStatus> {
  try {
    const res = await fetch(`${API_BASE}/status`);
    if (!res.ok) throw new Error('Failed to query backend status API');
    return await res.json();
  } catch (error) {
    // If backend is entirely offline (e.g. static host static github pages), fallback elegantly to local storage indices
    return {
      hasMongoUriEnv: false,
      isMongoConnected: false,
      storageType: 'local_json'
    };
  }
}

// Fetch complete schedule state for 2026
export async function loadScheduleFromBackend(): Promise<AppState | null> {
  try {
    const res = await fetch(`${API_BASE}/schedule`);
    if (!res.ok) throw new Error('Failed to load schedule from server');
    const data = await res.json();
    return Object.keys(data).length > 0 ? (data as AppState) : null;
  } catch (error) {
    console.error('loadScheduleFromBackend: ', error);
    return null;
  }
}

// Push mutations of specified month's metrics to database
export async function saveMonthToBackend(month: number, data: MonthData): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/schedule/${month}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (error) {
    console.error('saveMonthToBackend: ', error);
    return false;
  }
}

// Retrieve activity log list
export async function loadLogsFromBackend(): Promise<LogEntry[] | null> {
  try {
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) throw new Error('Failed to load logs from server');
    return await res.json();
  } catch (error) {
    console.error('loadLogsFromBackend: ', error);
    return null;
  }
}

// Commit single track action log
export async function saveLogToBackend(log: LogEntry): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    });
    return res.ok;
  } catch (error) {
    console.error('saveLogToBackend: ', error);
    return false;
  }
}

// Erase complete log documents
export async function clearAllLogsInBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/logs`, {
      method: 'DELETE'
    });
    return res.ok;
  } catch (error) {
    console.error('clearAllLogsInBackend: ', error);
    return false;
  }
}
