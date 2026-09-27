export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}

export const KM_PER_MI = 1.609344;

export function toStoredKm(value, unit) {
  const n = Number(value) || 0;
  return unit === "mi" ? n * KM_PER_MI : n;
}

export function fromStoredKm(km, unit) {
  const n = Number(km) || 0;
  return unit === "mi" ? n / KM_PER_MI : n;
}

export function formatDistance(km, settings) {
  const value = fromStoredKm(km, settings.distanceUnit);
  return `${value.toFixed(1)} ${settings.distanceUnit}`;
}

export function formatAmount(km, settings) {
  const value = fromStoredKm(km, settings.distanceUnit) * (Number(settings.mileageRate) || 0);
  return `${settings.currency || ""} ${value.toFixed(2)}`.trim();
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return "";
  const ms = new Date(endIso) - new Date(startIso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function todayLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function localDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function localTimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(11, 16);
}

export function purposeLabel(purpose) {
  return { business: "Business", personal: "Personal", commute: "Commute" }[purpose] || "Unset";
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Every trip field can come from an imported backup file, not just the app's own
// forms, so anything interpolated into innerHTML must be escaped at render time
// rather than trusted from where it was written.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// A cell starting with = + - @ is executed as a formula by Excel/Sheets when the
// CSV is opened, so free-text fields (notes, labels) need a guard beyond quoting.
const CSV_FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function escapeCsv(value) {
  let s = String(value ?? "");
  if (CSV_FORMULA_PREFIXES.some((prefix) => s.startsWith(prefix))) {
    s = "'" + s;
  }
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tripsToCsv(trips, settings) {
  const header = [
    "Date",
    "Start time",
    "End time",
    "Start",
    "End",
    `Distance (${settings.distanceUnit})`,
    "Purpose",
    "Vehicle",
    "Amount",
    "Notes",
  ];
  const rows = trips.map((t) => [
    formatDate(t.startTime).replace(/,/g, ""),
    formatTime(t.startTime),
    formatTime(t.endTime),
    t.startLabel || "",
    t.endLabel || "",
    fromStoredKm(t.distanceKm, settings.distanceUnit).toFixed(1),
    purposeLabel(t.purpose),
    t.vehicle || "",
    formatAmount(t.distanceKm, settings),
    t.notes || "",
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

const VALID_PURPOSES = new Set(["", "business", "personal", "commute"]);
const VALID_STATUSES = new Set(["ready", "needs_review"]);
const VALID_SOURCES = new Set(["manual", "tracked"]);
export const MAX_IMPORTED_TRIPS = 20000;

function clampText(value, maxLen) {
  return String(value ?? "").slice(0, maxLen);
}

function toIsoOrNull(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanCoords(value) {
  if (
    value &&
    typeof value === "object" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lon) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lon) <= 180
  ) {
    return { lat: value.lat, lon: value.lon };
  }
  return null;
}

// A backup file is untrusted input (it may have been shared, edited, or crafted
// by someone else) — every field is re-typed and bounded here rather than
// trusted as-is, and a fresh id is always assigned instead of reusing the file's.
export function sanitizeImportedTrip(raw) {
  if (!raw || typeof raw !== "object") return null;
  const startTime = toIsoOrNull(raw.startTime);
  if (!startTime) return null;
  const distanceKm = Number(raw.distanceKm);
  return {
    id: uid(),
    status: VALID_STATUSES.has(raw.status) ? raw.status : "needs_review",
    purpose: VALID_PURPOSES.has(raw.purpose) ? raw.purpose : "",
    startTime,
    endTime: toIsoOrNull(raw.endTime) || startTime,
    startLabel: clampText(raw.startLabel, 200),
    endLabel: clampText(raw.endLabel, 200),
    startCoords: cleanCoords(raw.startCoords),
    endCoords: cleanCoords(raw.endCoords),
    distanceKm: Number.isFinite(distanceKm) && distanceKm >= 0 ? distanceKm : 0,
    vehicle: clampText(raw.vehicle, 120),
    notes: clampText(raw.notes, 2000),
    source: VALID_SOURCES.has(raw.source) ? raw.source : "manual",
    createdAt: toIsoOrNull(raw.createdAt) || new Date().toISOString(),
  };
}

export function sanitizeImportedSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rate = Number(raw.mileageRate);
  return {
    vehicleName: clampText(raw.vehicleName, 120),
    distanceUnit: raw.distanceUnit === "mi" ? "mi" : "km",
    mileageRate: Number.isFinite(rate) && rate >= 0 ? rate : 0,
    currency: clampText(raw.currency, 10),
    defaultPurpose: VALID_PURPOSES.has(raw.defaultPurpose) ? raw.defaultPurpose : "",
  };
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
