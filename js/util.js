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

export function escapeCsv(value) {
  const s = String(value ?? "");
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
