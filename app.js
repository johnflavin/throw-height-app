'use strict';

// ── Configuration ────────────────────────────────────────────────────────────

// Freefall is declared when |accelerationIncludingGravity| drops below this.
// The plan doc predicts it will be near 0 in freefall; we'll see what the
// data actually shows and can tune this value from observations.
const FREEFALL_THRESHOLD_MPS2 = 2.0;

// Ignore freefall events shorter than this (fumbles / sensor noise).
const MIN_FREEFALL_MS = 150;

const GRAVITY        = 9.81;   // m/s² — used in height formula
const CHART_WINDOW_MS = 5000;  // rolling chart window
const VARIANCE_N      = 60;    // samples for 1-second variance (~60 Hz)
const REST_VAR_MAX    = 0.25;  // (m/s²)² — below this → candidate for REST
const REST_BAND_MPS2  = 1.5;   // magnitude must be within this of GRAVITY for REST

// ── App state ────────────────────────────────────────────────────────────────

let appState       = 'REST';   // 'REST' | 'MOTION' | 'FREEFALL'
let freefallStartTs = null;    // event.timeStamp when freefall began
const magBuffer    = [];       // rolling window for variance computation

// ── Chart data (shared mutable arrays — Chart.js holds references to these) ──

const chartLabels = [];  // event.timeStamp values (ms) — x-axis, hidden
const chartMagIG  = [];  // |accelerationIncludingGravity| per sample
const chartMagLA  = [];  // |acceleration| (gravity-removed) per sample, or null
let chart;

// ── DOM refs ─────────────────────────────────────────────────────────────────

const el = {
  overlay:       document.getElementById('overlay'),
  grantBtn:      document.getElementById('grant-btn'),
  permError:     document.getElementById('permission-error'),
  stateBanner:   document.getElementById('state-banner'),
  stateLabel:    document.getElementById('state-label'),
  freefallTimer: document.getElementById('freefall-timer'),
  heightResult:  document.getElementById('height-result'),
  valX:          document.getElementById('val-x'),
  valY:          document.getElementById('val-y'),
  valZ:          document.getElementById('val-z'),
  valMagIG:      document.getElementById('val-mag-ig'),
  valMagLA:      document.getElementById('val-mag-la'),
  valInterval:   document.getElementById('val-interval'),
  valVariance:   document.getElementById('val-variance'),
  historyList:   document.getElementById('history-list'),
};

// ── Permission / startup ─────────────────────────────────────────────────────

// Guard against double-tap while the iOS permission dialog is open.
let permissionPending = false;

el.grantBtn.addEventListener('click', async () => {
  if (permissionPending) return;
  permissionPending = true;
  el.grantBtn.disabled = true;

  try {
    if (typeof DeviceMotionEvent === 'undefined') {
      throw new Error('DeviceMotion API not available in this browser.');
    }
    // iOS 13+ requires explicit permission from a user gesture
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') {
        throw new Error('Accelerometer permission was denied.');
      }
    }
    launch();
  } catch (err) {
    permissionPending = false;
    el.grantBtn.disabled = false;
    el.grantBtn.textContent = 'Unavailable';
    el.permError.textContent = err.message;
    el.permError.hidden = false;
  }
});

buildChart();

function launch() {
  el.overlay.style.display = 'none';
  window.addEventListener('devicemotion', onMotion);
}

// ── Chart ────────────────────────────────────────────────────────────────────

function buildChart() {
  chart = new Chart(document.getElementById('accel-chart'), {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: '|a+g| m/s²',
          data: chartMagIG,
          borderColor: '#64b5f6',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
          spanGaps: false,
        },
        {
          label: '|a| m/s² (gravity removed)',
          data: chartMagLA,
          borderColor: '#ffa726',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
          spanGaps: false,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          suggestedMax: 20,
          grid:  { color: '#222' },
          ticks: { color: '#666', font: { size: 10 } },
        },
      },
      plugins: {
        legend: {
          labels: { color: '#888', boxWidth: 10, font: { size: 10 } },
        },
        annotation: {
          annotations: {
            freefallLine: {
              type: 'line',
              yMin: FREEFALL_THRESHOLD_MPS2,
              yMax: FREEFALL_THRESHOLD_MPS2,
              borderColor: 'rgba(100, 181, 246, 0.4)',
              borderWidth: 1,
              borderDash: [4, 4],
            },
            gravityLine: {
              type: 'line',
              yMin: GRAVITY,
              yMax: GRAVITY,
              borderColor: 'rgba(102, 187, 106, 0.35)',
              borderWidth: 1,
              borderDash: [4, 4],
            },
          },
        },
      },
    },
  });
}

// ── Motion handler ───────────────────────────────────────────────────────────

function onMotion(evt) {
  const ig = evt.accelerationIncludingGravity;  // always present
  if (!ig || ig.x == null) return;

  const la    = evt.acceleration;  // gravity-removed; may be null or have null components
  const ts    = evt.timeStamp;

  const magIG = mag3(ig.x, ig.y, ig.z);
  const hasLA = la && la.x != null && la.y != null && la.z != null;
  const magLA = hasLA ? mag3(la.x, la.y, la.z) : null;

  // Update data table
  el.valX.textContent        = fmt(ig.x);
  el.valY.textContent        = fmt(ig.y);
  el.valZ.textContent        = fmt(ig.z);
  el.valMagIG.textContent    = magIG.toFixed(3);
  el.valMagLA.textContent    = magLA !== null ? magLA.toFixed(3) : 'n/a';
  el.valInterval.textContent = (evt.interval ?? 0).toFixed(1);

  // Rolling variance
  magBuffer.push(magIG);
  if (magBuffer.length > VARIANCE_N) magBuffer.shift();
  const v = variance(magBuffer);
  el.valVariance.textContent = v.toFixed(4);

  // Push to chart and trim to window
  chartLabels.push(ts);
  chartMagIG.push(magIG);
  chartMagLA.push(magLA);
  while (chartLabels.length > 1 && ts - chartLabels[0] > CHART_WINDOW_MS) {
    chartLabels.shift();
    chartMagIG.shift();
    chartMagLA.shift();
  }
  chart.update('none');

  // State machine
  tick(magIG, ts, v);
}

// ── State machine ────────────────────────────────────────────────────────────

function tick(magIG, ts, v) {
  if (magIG < FREEFALL_THRESHOLD_MPS2) {
    // In (or entering) freefall
    if (appState !== 'FREEFALL') {
      freefallStartTs = ts;
      setAppState('FREEFALL');
    }
    const elapsed = (ts - freefallStartTs) / 1000;
    el.freefallTimer.textContent = elapsed.toFixed(3) + ' s';
    return;
  }

  // Above freefall threshold — were we in freefall?
  if (appState === 'FREEFALL') {
    const durationMs = ts - freefallStartTs;
    if (durationMs >= MIN_FREEFALL_MS) {
      const durationS = durationMs / 1000;
      commitResult(durationS);
    }
    freefallStartTs = null;
  }

  // Determine new state: REST if magnitude ≈ g and variance is low
  const nearG   = Math.abs(magIG - GRAVITY) < REST_BAND_MPS2;
  const settled = magBuffer.length >= VARIANCE_N / 2 && v < REST_VAR_MAX;
  setAppState(nearG && settled ? 'REST' : 'MOTION');
}

function setAppState(s) {
  if (appState === s) return;
  appState = s;
  el.stateBanner.className = 'state-' + s.toLowerCase();
  el.stateLabel.textContent = s;
  if (s !== 'FREEFALL') {
    el.freefallTimer.textContent = '—';
  }
}

function commitResult(durationS) {
  // h = ½g(t/2)² = g·t²/8  where t is total freefall duration
  const height = GRAVITY * durationS * durationS / 8;

  el.heightResult.textContent = height.toFixed(2) + ' m';

  const empty = el.historyList.querySelector('.empty-note');
  if (empty) empty.remove();

  const li = document.createElement('li');
  li.textContent =
    new Date().toLocaleTimeString() +
    ' — ' + durationS.toFixed(3) + ' s → ' + height.toFixed(2) + ' m';
  el.historyList.prepend(li);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mag3(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

function fmt(n) {
  // Right-align sign for tidy column display
  return (n >= 0 ? '+' : '') + n.toFixed(3);
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  return arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
}
