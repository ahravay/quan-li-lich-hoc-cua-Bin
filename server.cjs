var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var import_mongodb = require("mongodb");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var mongoClient = null;
var mongoDb = null;
var isConnectingMongo = false;
async function getMongoDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (mongoDb) return mongoDb;
  if (isConnectingMongo) return null;
  isConnectingMongo = true;
  try {
    mongoClient = new import_mongodb.MongoClient(uri);
    await mongoClient.connect();
    mongoDb = mongoClient.db();
    console.log("MongoDB: Connected loaded successfully!");
    isConnectingMongo = false;
    return mongoDb;
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    isConnectingMongo = false;
    mongoClient = null;
    mongoDb = null;
    return null;
  }
}
var DATA_DIR = import_path.default.resolve(process.cwd(), "server_data");
var SCHEDULE_FILE = import_path.default.join(DATA_DIR, "schedule.json");
var LOGS_FILE = import_path.default.join(DATA_DIR, "logs.json");
function ensureDataDir() {
  if (!import_fs.default.existsSync(DATA_DIR)) {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  }
}
function loadLocalSchedule() {
  ensureDataDir();
  if (import_fs.default.existsSync(SCHEDULE_FILE)) {
    try {
      return JSON.parse(import_fs.default.readFileSync(SCHEDULE_FILE, "utf-8"));
    } catch (e) {
      console.error("Error parsing local server schedule database:", e);
    }
  }
  return {};
}
function saveLocalSchedule(data) {
  ensureDataDir();
  import_fs.default.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), "utf-8");
}
function loadLocalLogs() {
  ensureDataDir();
  if (import_fs.default.existsSync(LOGS_FILE)) {
    try {
      return JSON.parse(import_fs.default.readFileSync(LOGS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error parsing local server logs database:", e);
    }
  }
  return [];
}
function saveLocalLogs(logs) {
  ensureDataDir();
  import_fs.default.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
}
app.get("/api/status", async (req, res) => {
  const mongoUriStr = process.env.MONGODB_URI;
  const dbInstance = await getMongoDb();
  res.json({
    hasMongoUriEnv: !!mongoUriStr,
    isMongoConnected: !!dbInstance,
    storageType: dbInstance ? "mongodb" : "local_json"
  });
});
app.get("/api/schedule", async (req, res) => {
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection("schedule");
      const docs = await col.find({}).toArray();
      if (docs.length === 0) {
        const localData = loadLocalSchedule();
        if (Object.keys(localData).length > 0) {
          console.log("MongoDB: Backing up and migrating local JSON states to Cloud...");
          for (const key of Object.keys(localData)) {
            await col.updateOne(
              { _id: `month_${key}` },
              { $set: { month: parseInt(key, 10), ...localData[key] } },
              { upsert: true }
            );
          }
          return res.json(localData);
        }
        return res.json({});
      }
      const state = {};
      docs.forEach((doc) => {
        const idStr = String(doc._id);
        const monthNum = parseInt(idStr.replace("month_", ""), 10);
        if (!isNaN(monthNum)) {
          const { _id, month, ...rest } = doc;
          state[monthNum] = rest;
        }
      });
      return res.json(state);
    } else {
      return res.json(loadLocalSchedule());
    }
  } catch (err) {
    console.error("API Error /api/schedule:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
app.post("/api/schedule/:month", async (req, res) => {
  const monthStr = req.params.month;
  const monthNum = parseInt(monthStr, 10);
  const data = req.body;
  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ error: "Invalid month number (must be 1-12)" });
  }
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection("schedule");
      await col.updateOne(
        { _id: `month_${monthNum}` },
        { $set: { month: monthNum, ...data } },
        { upsert: true }
      );
    }
    const local = loadLocalSchedule();
    local[monthNum] = data;
    saveLocalSchedule(local);
    res.json({ success: true, month: monthNum });
  } catch (err) {
    console.error(`API Error POST /api/schedule/${monthNum}:`, err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
app.get("/api/logs", async (req, res) => {
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection("logs");
      const docs = await col.find({}).sort({ timestamp: -1 }).limit(1e3).toArray();
      const formattedLogs = docs.map((doc) => {
        const { _id, ...rest } = doc;
        return rest;
      });
      if (formattedLogs.length === 0) {
        const localLogs = loadLocalLogs();
        if (localLogs.length > 0) {
          console.log("MongoDB Migration: Uploading logs history into MongoDB logs collection...");
          await col.insertMany(localLogs);
          return res.json(localLogs);
        }
      }
      return res.json(formattedLogs);
    } else {
      return res.json(loadLocalLogs());
    }
  } catch (err) {
    console.error("API Error GET /api/logs:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
app.post("/api/logs", async (req, res) => {
  try {
    const log = req.body;
    if (!log || !log.id) {
      return res.status(400).json({ error: "Log entity and id identifier are required" });
    }
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection("logs");
      await col.updateOne({ id: log.id }, { $set: log }, { upsert: true });
    }
    const localLogs = loadLocalLogs();
    const updated = [log, ...localLogs].slice(0, 1e3);
    saveLocalLogs(updated);
    res.json({ success: true, logId: log.id });
  } catch (err) {
    console.error("API Error POST /api/logs:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
app.delete("/api/logs", async (req, res) => {
  try {
    const dbInstance = await getMongoDb();
    if (dbInstance) {
      const col = dbInstance.collection("logs");
      await col.deleteMany({});
    }
    saveLocalLogs([]);
    res.json({ success: true });
  } catch (err) {
    console.error("API Error DELETE /api/logs:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Server] booted up at http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
