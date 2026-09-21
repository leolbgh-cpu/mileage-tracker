function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

const MIN_ACCURACY_M = 50;
const MIN_MOVE_KM = 0.01;

// Foreground-only GPS trip recorder. Browsers cannot reliably track location
// once the tab/app is backgrounded or the phone is locked, especially on iOS,
// so this only accumulates distance while the page stays open and visible.
export class TripTracker {
  constructor({ onUpdate } = {}) {
    this.watchId = null;
    this.points = [];
    this.distanceKm = 0;
    this.startedAt = null;
    this.onUpdate = onUpdate || (() => {});
  }

  isTracking() {
    return this.watchId !== null;
  }

  start() {
    if (!("geolocation" in navigator)) {
      throw new Error("Geolocation is not available in this browser.");
    }
    this.points = [];
    this.distanceKm = 0;
    this.startedAt = new Date().toISOString();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => this.onUpdate({ error: err.message, distanceKm: this.distanceKm }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return this.startedAt;
  }

  _handlePosition(pos) {
    const point = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      t: pos.timestamp,
    };
    if (point.accuracy && point.accuracy > MIN_ACCURACY_M) {
      this.onUpdate({ distanceKm: this.distanceKm, lastAccuracy: point.accuracy, skipped: true });
      return;
    }
    const last = this.points[this.points.length - 1];
    if (last) {
      const delta = haversineKm(last, point);
      if (delta >= MIN_MOVE_KM) {
        this.distanceKm += delta;
        this.points.push(point);
      }
    } else {
      this.points.push(point);
    }
    this.onUpdate({ distanceKm: this.distanceKm, lastPoint: point });
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    const endedAt = new Date().toISOString();
    const first = this.points[0] || null;
    const lastPt = this.points[this.points.length - 1] || null;
    return {
      startedAt: this.startedAt,
      endedAt,
      distanceKm: this.distanceKm,
      startCoords: first ? { lat: first.lat, lon: first.lon } : null,
      endCoords: lastPt ? { lat: lastPt.lat, lon: lastPt.lon } : null,
      pointCount: this.points.length,
    };
  }
}
