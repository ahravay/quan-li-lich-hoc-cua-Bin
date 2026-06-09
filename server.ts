import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { MongoClient, Db } from 'mongodb';

const app = express();
const PORT = 3000;

app.use(express.json());

// MongoDB initialization client state
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isConnectingMongo = false;

async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  
  if (mongoDb) return mongoDb;
  if (isConnectingMongo) return null;

  isConnectingMongo = true;
  try {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    mongoDb = mongoClient.db();
    console.log('MongoDB: Connected loaded successfully!');
    isConnectingMongo = false;
    return mongoDb;
  } catch (error) {
    console.error('MongoDB Connection Error:', error);
    isConnectingMongo = false;
    mongoClient = null;
    mongoDb = null;
    return null;
  }
}

// Local Server JSON Backup Fallback
const DATA_DIR = path.resolve(process.cwd(), 'server_data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadLocalSchedule(): any {
  ensureDataDir();
  if (fs.existsSync(SCHEDULE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error parsing local server schedule database:', e);
    }
  }
  return {};
}

function saveLocalSchedule(data: any) {
  ensureDataDir();
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function loadLocalLogs(): any[] {
  ensureDataDir();
  if (fs.existsSync(LOGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
    } catch (e) {
      console.error('Error parsing local server logs database:', e);
    }
  }
  return [];
}

function saveLocalLogs(logs: any[]) {
  ensureDataDir();
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
}

// ==========================================
// API Endpoints
// ==========================================

// 1. GET API active status and database sync configurations
app.get('/api/status', async (req, res) => {
  const mongoUriStr = process.env.MONGODB_URI;
  const dbInstance = await getMongoDb();
  res.json({
    hasMongoUriEnv: !!mongoUriStr,
    isMongoConnected: !!dbInstance,
    storageType: dbInstance ? 'mongodb' : 'local_json'
  });
});

// 2. GET complete app state for the 12 months
app.get('/api/schedule', async (req, res) => {
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection('schedule');
      const docs = await col.find({}).toArray();
      
      if (docs.length === 0) {
        // Automatic onboarding migration from server-side local JSON files to MongoDB
        const localData = loadLocalSchedule();
        if (Object.keys(localData).length > 0) {
          console.log('MongoDB: Backing up and migrating local JSON states to Cloud...');
          for (const key of Object.keys(localData)) {
            await col.updateOne(
              { _id: `month_${key}` as any },
              { $set: { month: parseInt(key, 10), ...localData[key] } },
              { upsert: true }
            );
          }
          return res.json(localData);
        }
        return res.json({});
      }

      // Convert arrays of documents to State format: { [monthNum]: MonthData }
      const state: any = {};
      docs.forEach((doc: any) => {
        const idStr = String(doc._id);
        const monthNum = parseInt(idStr.replace('month_', ''), 10);
        if (!isNaN(monthNum)) {
          const { _id, month, ...rest } = doc;
          state[monthNum] = rest;
        }
      });
      return res.json(state);
    } else {
      return res.json(loadLocalSchedule());
    }
  } catch (err: any) {
    console.error('API Error /api/schedule:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 3. POST single month data update
app.post('/api/schedule/:month', async (req, res) => {
  const monthStr = req.params.month;
  const monthNum = parseInt(monthStr, 10);
  const data = req.body;

  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ error: 'Invalid month number (must be 1-12)' });
  }

  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection('schedule');
      await col.updateOne(
        { _id: `month_${monthNum}` as any },
        { $set: { month: monthNum, ...data } },
        { upsert: true }
      );
    }

    // Mirror to local JSON files as high reliability replica
    const local = loadLocalSchedule();
    local[monthNum] = data;
    saveLocalSchedule(local);

    res.json({ success: true, month: monthNum });
  } catch (err: any) {
    console.error(`API Error POST /api/schedule/${monthNum}:`, err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 4. GET user activity logs log timeline
app.get('/api/logs', async (req, res) => {
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection('logs');
      const docs = await col.find({}).sort({ timestamp: -1 }).limit(1000).toArray();
      const formattedLogs = docs.map((doc: any) => {
        const { _id, ...rest } = doc;
        return rest;
      });
      
      if (formattedLogs.length === 0) {
        const localLogs = loadLocalLogs();
        if (localLogs.length > 0) {
          console.log('MongoDB Migration: Uploading logs history into MongoDB logs collection...');
          await col.insertMany(localLogs);
          return res.json(localLogs);
         }
      }
      return res.json(formattedLogs);
    } else {
      return res.json(loadLocalLogs());
    }
  } catch (err: any) {
    console.error('API Error GET /api/logs:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 5. POST new log entry
app.post('/api/logs', async (req, res) => {
  try {
    const log = req.body;
    if (!log || !log.id) {
      return res.status(400).json({ error: 'Log entity and id identifier are required' });
    }

    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection('logs');
      await col.updateOne({ id: log.id }, { $set: log }, { upsert: true });
    }

    // Mirror to server filesystem files
    const localLogs = loadLocalLogs();
    const updated = [log, ...localLogs].slice(0, 1000);
    saveLocalLogs(updated);

    res.json({ success: true, logId: log.id });
  } catch (err: any) {
    console.error('API Error POST /api/logs:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 6. DELETE clear all logs in central repository
app.delete('/api/logs', async (req, res) => {
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection('logs');
      await col.deleteMany({});
    }

    saveLocalLogs([]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('API Error DELETE /api/logs:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// ==========================================
// Main server and SPA asset middlewares
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Full-Stack Server] booted up at http://localhost:${PORT}`);
  });
}

startServer();
