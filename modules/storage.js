// LedgerFlow Storage Engine: IndexedDB Local-First Core
const DB_NAME = "ledgerflow_db";
const DB_VERSION = 1;
const STORE_LEDGER = "ledger_state";
const STORE_SLIPS = "slips";
const STORE_SECURITY = "security";

let dbInstance = null;
const slipUrlCache = new Map();

function openDatabase() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_LEDGER)) {
        db.createObjectStore(STORE_LEDGER);
      }
      if (!db.objectStoreNames.contains(STORE_SLIPS)) {
        db.createObjectStore(STORE_SLIPS);
      }
      if (!db.objectStoreNames.contains(STORE_SECURITY)) {
        db.createObjectStore(STORE_SECURITY);
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });
}

function idbGet(storeName, key) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      })
  );
}

function idbSet(storeName, key, value) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          const req = store.put(value, key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      })
  );
}

function idbDelete(storeName, key) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      })
  );
}

function idbGetAll(storeName) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          const items = [];
          const req = store.openCursor();
          req.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              items.push({ key: cursor.key, value: cursor.value });
              cursor.continue();
            } else {
              resolve(items);
            }
          };
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      })
  );
}

// -------------------------------------------------------------
// State Storage & Migration
// -------------------------------------------------------------
export async function loadPersistedState(storageKey, defaultState, normalizeState) {
  try {
    // 1. Try loading from IndexedDB
    const fromIdb = await idbGet(STORE_LEDGER, storageKey);
    if (fromIdb && typeof fromIdb === "object") {
      return normalizeState(fromIdb);
    }

    // 2. Fallback to localStorage (Auto-Migration)
    const rawLocal = window.localStorage.getItem(storageKey);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      const normalized = normalizeState(parsed);
      // Migrate forward to IndexedDB
      await idbSet(STORE_LEDGER, storageKey, normalized);
      return normalized;
    }
  } catch (error) {
    console.error("Storage loading error:", error);
  }
  return structuredClone(defaultState);
}

export function savePersistedState(storageKey, serializableState) {
  try {
    // Synchronous localStorage write for instant resilience
    window.localStorage.setItem(storageKey, JSON.stringify(serializableState));
  } catch (e) {
    console.warn("localStorage quota exceeded, continuing with IndexedDB:", e);
  }

  // Primary persistent write in IndexedDB
  void idbSet(STORE_LEDGER, storageKey, serializableState).catch((err) =>
    console.error("IndexedDB save error:", err)
  );
}

// -------------------------------------------------------------
// Transaction Receipt Slips (IndexedDB Blob Engine)
// -------------------------------------------------------------
export async function saveTransactionSlip(fileLike, options = {}) {
  const blob = fileLike instanceof Blob ? fileLike : null;
  if (!blob) {
    throw new Error("No image file provided for slip.");
  }
  const transactionId = String(options.transactionId || "").trim() || "txn_" + Date.now();
  const resolution = String(options.resolution || "720").trim();
  const mimeType = String(options.contentType || blob.type || "image/jpeg").trim();
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `slip_${transactionId}_${Date.now()}.${ext}`;

  await idbSet(STORE_SLIPS, path, {
    blob,
    mimeType,
    resolution,
    sizeBytes: blob.size,
    updatedAt: new Date().toISOString(),
  });

  return {
    path,
    contentType: mimeType,
    sizeBytes: blob.size,
    resolution,
  };
}

export async function resolveTransactionSlipUrl(path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return "";

  if (slipUrlCache.has(normalizedPath)) {
    return slipUrlCache.get(normalizedPath);
  }

  try {
    const slipRecord = await idbGet(STORE_SLIPS, normalizedPath);
    if (!slipRecord || !slipRecord.blob) return "";

    const url = URL.createObjectURL(slipRecord.blob);
    slipUrlCache.set(normalizedPath, url);
    return url;
  } catch (err) {
    console.error("Error resolving slip URL:", err);
    return "";
  }
}

export function clearSlipUrlCache(path = "") {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) {
    slipUrlCache.forEach((url) => URL.revokeObjectURL(url));
    slipUrlCache.clear();
    return;
  }
  if (slipUrlCache.has(normalizedPath)) {
    URL.revokeObjectURL(slipUrlCache.get(normalizedPath));
    slipUrlCache.delete(normalizedPath);
  }
}

export async function deleteTransactionSlip(path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return;
  clearSlipUrlCache(normalizedPath);
  await idbDelete(STORE_SLIPS, normalizedPath);
}

export async function deleteTransactionSlips(paths = []) {
  for (const p of paths) {
    await deleteTransactionSlip(p);
  }
}

export async function getAllSlipsForBackup() {
  const records = await idbGetAll(STORE_SLIPS);
  return records.map((r) => ({
    path: r.key,
    blob: r.value.blob,
    mimeType: r.value.mimeType,
    resolution: r.value.resolution,
  }));
}

export async function importSlipFromBackup(path, blob, mimeType = "image/jpeg") {
  await idbSet(STORE_SLIPS, path, {
    blob,
    mimeType,
    resolution: "720",
    sizeBytes: blob.size,
    updatedAt: new Date().toISOString(),
  });
  clearSlipUrlCache(path);
}

// -------------------------------------------------------------
// Security & PIN Preferences
// -------------------------------------------------------------
const DEFAULT_SECURITY = {
  isLockEnabled: false,
  pinHash: "",
  pinSalt: "",
  biometricEnabled: false,
  autoLockTimeoutSeconds: 0, // 0 = Immediately upon minimizing
  failedAttempts: 0,
  lockoutUntil: 0,
};

export async function getSecuritySettings() {
  try {
    const settings = await idbGet(STORE_SECURITY, "config");
    return { ...DEFAULT_SECURITY, ...(settings || {}) };
  } catch (e) {
    return { ...DEFAULT_SECURITY };
  }
}

export async function saveSecuritySettings(settings) {
  await idbSet(STORE_SECURITY, "config", settings);
}
