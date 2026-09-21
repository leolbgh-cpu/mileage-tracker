const DB_NAME = "mileage-tracker-db";
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("trips")) {
        const store = db.createObjectStore("trips", { keyPath: "id" });
        store.createIndex("byStatus", "status");
        store.createIndex("byStartTime", "startTime");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

async function store(name, mode) {
  const db = await getDB();
  return db.transaction(name, mode).objectStore(name);
}

function defaultSettings() {
  return {
    id: "settings",
    vehicleName: "My car",
    distanceUnit: "km",
    mileageRate: 0,
    currency: "USD",
    defaultPurpose: "business",
  };
}

async function putTrip(trip) {
  const s = await store("trips", "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.put(trip);
    req.onsuccess = () => resolve(trip);
    req.onerror = () => reject(req.error);
  });
}

async function deleteTrip(id) {
  const s = await store("trips", "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllTrips() {
  const s = await store("trips", "readonly");
  return new Promise((resolve, reject) => {
    const req = s.getAll();
    req.onsuccess = () =>
      resolve(req.result.sort((a, b) => b.startTime.localeCompare(a.startTime)));
    req.onerror = () => reject(req.error);
  });
}

async function getSettings() {
  const s = await store("settings", "readonly");
  return new Promise((resolve, reject) => {
    const req = s.get("settings");
    req.onsuccess = () => resolve(req.result || defaultSettings());
    req.onerror = () => reject(req.error);
  });
}

async function saveSettings(settings) {
  const record = { ...settings, id: "settings" };
  const s = await store("settings", "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function replaceAllTrips(trips) {
  const s = await store("trips", "readwrite");
  return new Promise((resolve, reject) => {
    const clearReq = s.clear();
    clearReq.onsuccess = () => {
      trips.forEach((t) => s.put(t));
      resolve();
    };
    clearReq.onerror = () => reject(clearReq.error);
  });
}

async function clearAll() {
  const tripsStore = await store("trips", "readwrite");
  await new Promise((resolve, reject) => {
    const req = tripsStore.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  putTrip,
  deleteTrip,
  getAllTrips,
  getSettings,
  saveSettings,
  replaceAllTrips,
  clearAll,
  defaultSettings,
};
