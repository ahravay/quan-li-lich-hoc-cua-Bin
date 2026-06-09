import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc,
  collection, 
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppState, LogEntry, MonthData } from './types';

export const isFirebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

let app;
let db: any = null;

if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
}

export { db };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Fetch all 12 months of 2026 from Firestore
export async function loadScheduleFromCloud(): Promise<AppState | null> {
  if (!isFirebaseConfigured || !db) return null;
  const path = 'schedule';
  try {
    const colRef = collection(db, path);
    const snap = await getDocs(colRef);
    if (snap.empty) return null;

    const data: AppState = {};
    snap.forEach((docSnap) => {
      const monthNum = parseInt(docSnap.id.replace('month_', ''), 10);
      if (!isNaN(monthNum)) {
        data[monthNum] = docSnap.data() as MonthData;
      }
    });

    // Make sure we fill any missing months
    return Object.keys(data).length > 0 ? data : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
}

// Save a single month data to Firestore schedule
export async function saveMonthToCloud(month: number, data: MonthData): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const path = `schedule/month_${month}`;
  try {
    await setDoc(doc(db, 'schedule', `month_${month}`), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Fetch all logs from Firestore timeline logs
export async function loadLogsFromCloud(): Promise<LogEntry[] | null> {
  if (!isFirebaseConfigured || !db) return null;
  const path = 'logs';
  try {
    const snap = await getDocs(collection(db, path));
    const items: LogEntry[] = [];
    snap.forEach((docSnap) => {
      items.push(docSnap.data() as LogEntry);
    });
    // Sort descending by timestamp
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
}

// Add a single log to Firestore logs
export async function saveLogToCloud(log: LogEntry): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const path = `logs/${log.id}`;
  try {
    await setDoc(doc(db, 'logs', log.id), log);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Delete all logs from Firestore
export async function clearAllLogsInCloud(): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const path = 'logs';
  try {
    const snap = await getDocs(collection(db, path));
    const batch = writeBatch(db);
    snap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
