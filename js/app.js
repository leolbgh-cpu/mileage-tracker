import { db } from "./db.js";
import { TripTracker } from "./geo.js";
import {
  uid,
  formatDistance,
  formatAmount,
  formatDate,
  formatTime,
  formatDuration,
  todayLocalDateString,
  combineDateTime,
  localDateInput,
  localTimeInput,
  purposeLabel,
  toStoredKm,
  fromStoredKm,
  tripsToCsv,
  downloadFile,
  escapeHtml,
  sanitizeImportedTrip,
  sanitizeImportedSettings,
  MAX_IMPORTED_TRIPS,
} from "./util.js";
import { getSession, startGoogleSignIn, signOut } from "./auth.js";

const state = {
  view: "inbox",
  inboxTab: "ready",
  trips: [],
  settings: db.defaultSettings(),
  editingTripId: null,
};

const tracker = new TripTracker({ onUpdate: onTrackerUpdate });
let elapsedTimer = null;

const el = {
  subtitle: document.getElementById("topbar-subtitle"),
  inboxTabs: document.getElementById("inbox-tabs"),
  viewRoot: document.getElementById("view-root"),
  bottomNav: document.querySelector(".bottom-nav"),
  addTripBtn: document.getElementById("add-trip-btn"),
  addChoiceDialog: document.getElementById("add-choice-dialog"),
  startTrackingBtn: document.getElementById("start-tracking-btn"),
  addManualBtn: document.getElementById("add-manual-btn"),
  tripDialog: document.getElementById("trip-dialog"),
  tripForm: document.getElementById("trip-form"),
  tripDialogTitle: document.getElementById("trip-dialog-title"),
  tripDeleteBtn: document.getElementById("trip-delete-btn"),
  recordingPill: document.getElementById("recording-pill"),
  recordingBanner: document.getElementById("recording-banner"),
  recordingDistance: document.getElementById("recording-distance"),
  recordingElapsed: document.getElementById("recording-elapsed"),
  stopRecordingBtn: document.getElementById("stop-recording-btn"),
  appRoot: document.getElementById("app"),
  loginScreen: document.getElementById("login-screen"),
  loginError: document.getElementById("login-error"),
  googleSigninButton: document.getElementById("google-signin-button"),
};

async function boot() {
  const session = getSession();
  if (session) {
    showApp();
    return;
  }
  showLogin();
}

function showLogin() {
  el.loginScreen.classList.remove("hidden");
  el.appRoot.classList.add("hidden");
  startGoogleSignIn(el.googleSigninButton, {
    onError: (err) => {
      el.loginError.textContent = err.message;
      el.loginError.classList.remove("hidden");
    },
  })
    .then(() => {
      el.loginError.classList.add("hidden");
      showApp();
    })
    .catch((err) => {
      el.loginError.textContent = err.message;
      el.loginError.classList.remove("hidden");
    });
}

function showApp() {
  el.loginScreen.classList.add("hidden");
  el.appRoot.classList.remove("hidden");
  init();
}

async function init() {
  const [trips, settings] = await Promise.all([db.getAllTrips(), db.getSettings()]);
  state.trips = trips;
  state.settings = settings;
  el.subtitle.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  wireNav();
  wireAddFlow();
  wireTripForm();
  render();
  registerServiceWorker();
}

function wireNav() {
  el.bottomNav.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      el.bottomNav
        .querySelectorAll(".nav-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
  });
  el.inboxTabs.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.inboxTab = btn.dataset.tab;
      el.inboxTabs.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderInbox();
    });
  });
}

function wireAddFlow() {
  el.addTripBtn.addEventListener("click", () => el.addChoiceDialog.showModal());
  el.startTrackingBtn.addEventListener("click", () => {
    el.addChoiceDialog.close();
    startTracking();
  });
  el.addManualBtn.addEventListener("click", () => {
    el.addChoiceDialog.close();
    openTripDialog();
  });
  el.stopRecordingBtn.addEventListener("click", stopTracking);
}

function wireTripForm() {
  el.tripForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveTripFromForm();
  });
  el.tripDeleteBtn.addEventListener("click", async () => {
    if (!state.editingTripId) return;
    if (!confirm("Delete this trip?")) return;
    await db.deleteTrip(state.editingTripId);
    state.trips = await db.getAllTrips();
    el.tripDialog.close();
    render();
  });
}

// ---------- Tracking ----------

function startTracking() {
  try {
    tracker.start();
  } catch (err) {
    alert(err.message);
    return;
  }
  el.recordingPill.classList.remove("hidden");
  el.recordingBanner.classList.remove("hidden");
  el.recordingDistance.textContent = formatDistance(0, state.settings);
  elapsedTimer = setInterval(updateElapsed, 1000);
  updateElapsed();
}

function updateElapsed() {
  if (!tracker.startedAt) return;
  el.recordingElapsed.textContent = formatDuration(tracker.startedAt, new Date().toISOString());
}

function onTrackerUpdate({ distanceKm }) {
  if (typeof distanceKm === "number") {
    el.recordingDistance.textContent = formatDistance(distanceKm, state.settings);
  }
}

async function stopTracking() {
  const result = tracker.stop();
  clearInterval(elapsedTimer);
  el.recordingPill.classList.add("hidden");
  el.recordingBanner.classList.add("hidden");

  if (!result.startedAt || result.distanceKm <= 0) {
    return;
  }

  const trip = {
    id: uid(),
    status: "needs_review",
    purpose: state.settings.defaultPurpose || "",
    startTime: result.startedAt,
    endTime: result.endedAt,
    startLabel: "",
    endLabel: "",
    startCoords: result.startCoords,
    endCoords: result.endCoords,
    distanceKm: result.distanceKm,
    vehicle: state.settings.vehicleName || "",
    notes: "",
    source: "tracked",
    createdAt: new Date().toISOString(),
  };
  await db.putTrip(trip);
  state.trips = await db.getAllTrips();
  render();
  openTripDialog(trip.id);
}

// ---------- Trip dialog ----------

function openTripDialog(tripId) {
  state.editingTripId = tripId || null;
  const trip = tripId ? state.trips.find((t) => t.id === tripId) : null;
  el.tripDialogTitle.textContent = trip ? "Edit trip" : "Add trip";
  el.tripDeleteBtn.classList.toggle("hidden", !trip);
  document.getElementById("trip-distance-unit").textContent = state.settings.distanceUnit;

  const now = new Date().toISOString();
  document.getElementById("trip-date").value = localDateInput(trip?.startTime || now);
  document.getElementById("trip-start-time").value = localTimeInput(trip?.startTime || now);
  document.getElementById("trip-end-time").value = localTimeInput(trip?.endTime || now);
  document.getElementById("trip-start-label").value = trip?.startLabel || "";
  document.getElementById("trip-end-label").value = trip?.endLabel || "";
  document.getElementById("trip-distance").value = trip
    ? fromStoredKm(trip.distanceKm, state.settings.distanceUnit).toFixed(1)
    : "";
  document.getElementById("trip-purpose").value = trip?.purpose || state.settings.defaultPurpose || "";
  document.getElementById("trip-vehicle").value = trip?.vehicle ?? state.settings.vehicleName ?? "";
  document.getElementById("trip-notes").value = trip?.notes || "";

  el.tripDialog.showModal();
}

async function saveTripFromForm() {
  const date = document.getElementById("trip-date").value;
  const startTime = combineDateTime(date, document.getElementById("trip-start-time").value);
  const endTime = combineDateTime(date, document.getElementById("trip-end-time").value);
  if (!startTime || !endTime) {
    alert("Please provide a valid date and time.");
    return;
  }
  const purpose = document.getElementById("trip-purpose").value;
  const distanceInput = Number(document.getElementById("trip-distance").value) || 0;

  const existing = state.editingTripId ? state.trips.find((t) => t.id === state.editingTripId) : null;

  const trip = {
    id: existing?.id || uid(),
    status: purpose ? "ready" : "needs_review",
    purpose,
    startTime,
    endTime,
    startLabel: document.getElementById("trip-start-label").value.trim(),
    endLabel: document.getElementById("trip-end-label").value.trim(),
    startCoords: existing?.startCoords || null,
    endCoords: existing?.endCoords || null,
    distanceKm: toStoredKm(distanceInput, state.settings.distanceUnit),
    vehicle: document.getElementById("trip-vehicle").value.trim(),
    notes: document.getElementById("trip-notes").value.trim(),
    source: existing?.source || "manual",
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  await db.putTrip(trip);
  state.trips = await db.getAllTrips();
  el.tripDialog.close();
  render();
}

async function markReady(tripId) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;
  if (!trip.purpose) {
    openTripDialog(tripId);
    return;
  }
  trip.status = "ready";
  await db.putTrip(trip);
  state.trips = await db.getAllTrips();
  render();
}

// ---------- Rendering ----------

function render() {
  el.inboxTabs.classList.toggle("hidden", state.view !== "inbox");
  if (state.view === "inbox") renderInbox();
  else if (state.view === "all") renderAllTrips();
  else if (state.view === "report") renderReport();
  else if (state.view === "settings") renderSettings();
}

function emptyState(title, body) {
  return `<div class="empty-state">
    <div class="empty-badge">&#10003;</div>
    <h2>${title}</h2>
    <p class="muted">${body}</p>
  </div>`;
}

function tripRow(trip, { showReadyAction } = {}) {
  const amount = trip.purpose ? formatAmount(trip.distanceKm, state.settings) : "";
  const id = escapeHtml(trip.id);
  const purpose = escapeHtml(trip.purpose || "unset");
  const startLabel = escapeHtml(trip.startLabel || formatTime(trip.startTime));
  const endLabel = escapeHtml(trip.endLabel || formatTime(trip.endTime));
  return `<li class="trip-row" data-id="${id}">
    <button class="trip-row-main" data-open="${id}" type="button">
      <div class="trip-row-top">
        <span class="trip-date">${formatDate(trip.startTime)}</span>
        <span class="trip-distance">${formatDistance(trip.distanceKm, state.settings)}</span>
      </div>
      <div class="trip-route">
        <span>${startLabel}</span>
        <span class="arrow">&#8594;</span>
        <span>${endLabel}</span>
      </div>
      <div class="trip-row-bottom">
        <span class="badge badge-${purpose}">${purposeLabel(trip.purpose)}</span>
        ${amount ? `<span class="muted small">${escapeHtml(amount)}</span>` : ""}
      </div>
    </button>
    ${
      showReadyAction
        ? `<button class="trip-row-check" data-ready="${id}" type="button" aria-label="Mark ready">&#10003;</button>`
        : ""
    }
  </li>`;
}

function renderInbox() {
  const list =
    state.inboxTab === "ready"
      ? state.trips.filter((t) => t.status === "ready")
      : state.trips.filter((t) => t.status === "needs_review");

  if (list.length === 0) {
    el.viewRoot.innerHTML =
      state.inboxTab === "ready"
        ? emptyState("Nothing to send yet", "Trips you mark ready will show up here.")
        : emptyState("Inbox is clear", "Trips you track or add will land here for review.");
    return;
  }

  el.viewRoot.innerHTML = `<ul class="trip-list">${list
    .map((t) => tripRow(t, { showReadyAction: state.inboxTab === "review" }))
    .join("")}</ul>`;
  bindTripListEvents();
}

function renderAllTrips() {
  if (state.trips.length === 0) {
    el.viewRoot.innerHTML = emptyState("No trips yet", "Tap + to track or add your first trip.");
    return;
  }
  const totalKm = state.trips.reduce((sum, t) => sum + t.distanceKm, 0);
  el.viewRoot.innerHTML = `
    <div class="summary-bar">
      <span>${state.trips.length} trips</span>
      <span>${formatDistance(totalKm, state.settings)} total</span>
    </div>
    <ul class="trip-list">${state.trips.map((t) => tripRow(t)).join("")}</ul>`;
  bindTripListEvents();
}

function bindTripListEvents() {
  el.viewRoot.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openTripDialog(btn.dataset.open));
  });
  el.viewRoot.querySelectorAll("[data-ready]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      markReady(btn.dataset.ready);
    });
  });
}

function renderReport() {
  const today = todayLocalDateString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const monthAgoStr = localDateInput(monthAgo.toISOString());

  el.viewRoot.innerHTML = `
    <div class="panel">
      <h2>Mileage report</h2>
      <div class="row">
        <label>From <input type="date" id="report-from" value="${monthAgoStr}" /></label>
        <label>To <input type="date" id="report-to" value="${today}" /></label>
      </div>
      <label>Purpose
        <select id="report-purpose">
          <option value="">All</option>
          <option value="business">Business</option>
          <option value="personal">Personal</option>
          <option value="commute">Commute</option>
        </select>
      </label>
      <div id="report-summary"></div>
      <button id="report-export-btn" class="btn btn-primary btn-block">Export CSV</button>
    </div>`;

  const fromInput = document.getElementById("report-from");
  const toInput = document.getElementById("report-to");
  const purposeInput = document.getElementById("report-purpose");
  const summaryEl = document.getElementById("report-summary");

  function filteredTrips() {
    const from = fromInput.value;
    const to = toInput.value;
    const purpose = purposeInput.value;
    return state.trips.filter((t) => {
      const d = localDateInput(t.startTime);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (purpose && t.purpose !== purpose) return false;
      return true;
    });
  }

  function updateSummary() {
    const list = filteredTrips();
    const totalKm = list.reduce((sum, t) => sum + t.distanceKm, 0);
    const byPurpose = ["business", "personal", "commute"].map((p) => {
      const trips = list.filter((t) => t.purpose === p);
      const km = trips.reduce((sum, t) => sum + t.distanceKm, 0);
      return { p, count: trips.length, km };
    });
    summaryEl.innerHTML = `
      <div class="summary-bar"><span>${list.length} trips</span><span>${formatDistance(totalKm, state.settings)}</span></div>
      <ul class="report-breakdown">
        ${byPurpose
          .map(
            (b) =>
              `<li><span class="badge badge-${b.p}">${purposeLabel(b.p)}</span><span>${b.count} trips &middot; ${formatDistance(b.km, state.settings)} &middot; ${escapeHtml(formatAmount(b.km, state.settings))}</span></li>`,
          )
          .join("")}
      </ul>`;
  }

  [fromInput, toInput, purposeInput].forEach((input) => input.addEventListener("change", updateSummary));
  updateSummary();

  document.getElementById("report-export-btn").addEventListener("click", () => {
    const list = filteredTrips();
    if (list.length === 0) {
      alert("No trips in this range.");
      return;
    }
    const csv = tripsToCsv(list, state.settings);
    downloadFile(`mileage-log-${fromInput.value}-to-${toInput.value}.csv`, csv, "text/csv");
  });
}

function renderSettings() {
  const s = state.settings;
  const vehicleName = escapeHtml(s.vehicleName || "");
  const currency = escapeHtml(s.currency || "");
  const distanceUnit = escapeHtml(s.distanceUnit || "km");
  const session = getSession();
  el.viewRoot.innerHTML = `
    <div class="panel">
      <h2>Account</h2>
      <p class="muted small">${session ? `Signed in as ${escapeHtml(session.email)}` : "Not signed in"}</p>
      <button id="sign-out-btn" class="btn btn-secondary btn-block">Sign out</button>
    </div>
    <div class="panel">
      <h2>Settings</h2>
      <form id="settings-form">
        <label>Vehicle name <input type="text" id="s-vehicle" value="${vehicleName}" /></label>
        <label>Distance unit
          <select id="s-unit">
            <option value="km" ${s.distanceUnit === "km" ? "selected" : ""}>Kilometers</option>
            <option value="mi" ${s.distanceUnit === "mi" ? "selected" : ""}>Miles</option>
          </select>
        </label>
        <label>Mileage rate (per ${distanceUnit}) <input type="number" id="s-rate" min="0" step="0.01" value="${Number(s.mileageRate) || 0}" /></label>
        <label>Currency symbol <input type="text" id="s-currency" value="${currency}" /></label>
        <label>Default purpose
          <select id="s-purpose">
            <option value="" ${!s.defaultPurpose ? "selected" : ""}>Unset</option>
            <option value="business" ${s.defaultPurpose === "business" ? "selected" : ""}>Business</option>
            <option value="personal" ${s.defaultPurpose === "personal" ? "selected" : ""}>Personal</option>
            <option value="commute" ${s.defaultPurpose === "commute" ? "selected" : ""}>Commute</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save settings</button>
      </form>
    </div>
    <div class="panel">
      <h2>Backup</h2>
      <p class="muted small">All trip data stays on this device only. Export a backup before clearing browser data or switching devices.</p>
      <button id="export-data-btn" class="btn btn-secondary btn-block">Export backup (JSON)</button>
      <label class="btn btn-secondary btn-block file-btn">
        Import backup
        <input type="file" id="import-data-input" accept="application/json" hidden />
      </label>
    </div>
    <div class="panel">
      <h2>Danger zone</h2>
      <button id="clear-data-btn" class="btn btn-danger btn-block">Delete all trips</button>
    </div>`;

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    state.settings = await db.saveSettings({
      vehicleName: document.getElementById("s-vehicle").value.trim(),
      distanceUnit: document.getElementById("s-unit").value,
      mileageRate: Number(document.getElementById("s-rate").value) || 0,
      currency: document.getElementById("s-currency").value.trim(),
      defaultPurpose: document.getElementById("s-purpose").value,
    });
    render();
  });

  document.getElementById("export-data-btn").addEventListener("click", () => {
    const payload = { settings: state.settings, trips: state.trips, exportedAt: new Date().toISOString() };
    downloadFile(`mileage-backup-${todayLocalDateString()}.json`, JSON.stringify(payload, null, 2), "application/json");
  });

  document.getElementById("import-data-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!Array.isArray(payload.trips)) throw new Error("Invalid backup file.");
      if (payload.trips.length > MAX_IMPORTED_TRIPS) {
        throw new Error(`Backup file has too many trips (max ${MAX_IMPORTED_TRIPS}).`);
      }
      // The file is untrusted input, so every trip/setting is re-validated and
      // re-typed here rather than written to storage as-is.
      const cleanedTrips = payload.trips.map(sanitizeImportedTrip).filter(Boolean);
      if (!confirm(`Import ${cleanedTrips.length} trips? This replaces all current trips.`)) return;
      await db.replaceAllTrips(cleanedTrips);
      const cleanedSettings = sanitizeImportedSettings(payload.settings);
      if (cleanedSettings) state.settings = await db.saveSettings(cleanedSettings);
      state.trips = await db.getAllTrips();
      render();
    } catch (err) {
      alert("Could not import that file: " + err.message);
    }
  });

  document.getElementById("sign-out-btn").addEventListener("click", () => {
    signOut();
    location.reload();
  });

  document.getElementById("clear-data-btn").addEventListener("click", async () => {
    if (!confirm("Delete all trips? This cannot be undone.")) return;
    await db.clearAll();
    state.trips = [];
    render();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
