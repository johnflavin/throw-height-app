# Accelerometer API Research

Goal: build an app that reads phone accelerometer data, detects freefall, and estimates vertical throw height — replicating the core mechanic of "Send Me to Heaven" (SMTH).

---

## Short answer to "can I use a web page?"

**Yes, but with caveats.** iOS Safari supports the DeviceMotion API since iOS 13 but requires an explicit user permission tap. The web approach is the fastest path to a working prototype. For higher precision or background access, a native iOS app is better.

---

## 1. Web: DeviceMotion API

### What it provides

`DeviceMotionEvent` fires on `window` at a regular interval and delivers:

| Property | Description |
|---|---|
| `acceleration` | x/y/z in m/s², **gravity removed** (may be `null` on some hardware) |
| `accelerationIncludingGravity` | x/y/z in m/s², gravity included |
| `rotationRate` | alpha/beta/gamma in °/s |
| `interval` | milliseconds between events |

The axes follow the device orientation: x = left/right, y = front/back (toward top of screen), z = through screen.

### Sampling rate

Not mandated by spec. In practice: **~60 Hz** on iOS Safari, **~50–100 Hz** on Android Chrome. The `interval` field in each event tells you the actual rate.

### Browser / OS support

| Platform | Support | Notes |
|---|---|---|
| iOS Safari (≥ 13) | Yes | Requires explicit permission (see below) |
| iOS Chrome / Firefox | Partial | Uses WebKit under the hood; same permission model |
| Android Chrome | Yes | No permission prompt required |
| Desktop browsers | No useful data | No motion hardware |

### iOS 13+ permission requirement

Apple added a mandatory permission gate in iOS 13. You **must** call `DeviceMotionEvent.requestPermission()` from inside a user gesture (tap handler). Calling it on page load will reject silently.

```javascript
button.addEventListener('click', async () => {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const state = await DeviceMotionEvent.requestPermission();
    if (state === 'granted') {
      window.addEventListener('devicemotion', handleMotion);
    }
  } else {
    // Android / older iOS — no permission call needed
    window.addEventListener('devicemotion', handleMotion);
  }
});
```

Permission is remembered for the session (and sometimes across sessions) — the prompt only appears once.

### HTTPS requirement

**Mandatory.** DeviceMotion is a "powerful feature" and is blocked on plain HTTP. Any deployment must use HTTPS. GitHub Pages and Netlify provide this automatically.

### Limitations

- No background access — the page must be visible and active.
- Sampling rate is fixed by the browser; you cannot request a higher rate.
- The `acceleration` property (gravity-removed) can be `null` on some Android devices that lack a gyroscope for the fusion algorithm. `accelerationIncludingGravity` is always available but requires manual gravity subtraction.

---

## 2. Web: Generic Sensor API

A newer, more explicit API (`Accelerometer`, `LinearAccelerationSensor`, `GravitySensor`). Same underlying data, cleaner interface.

**Support status (2025/2026):** Implemented in Chromium-based browsers only. **Not supported in Safari.** Because iOS forces all browsers to use WebKit, this API is unavailable on any iOS browser. Skip this for the iOS use case.

---

## 3. iOS Native: CoreMotion

### CMMotionManager

The central class. One instance per app.

```swift
import CoreMotion

let motion = CMMotionManager()

// Option A: raw accelerometer (includes gravity)
motion.accelerometerUpdateInterval = 1.0 / 100.0  // 100 Hz
motion.startAccelerometerUpdates(to: .main) { data, error in
    guard let a = data?.acceleration else { return }
    // a.x, a.y, a.z in g-forces (1 g ≈ 9.81 m/s²)
}

// Option B: processed device motion (gravity separated out)
motion.deviceMotionUpdateInterval = 1.0 / 100.0
motion.startDeviceMotionUpdates(to: .main) { data, error in
    guard let d = data else { return }
    // d.gravity — the gravity vector
    // d.userAcceleration — motion with gravity removed, in g-forces
}
```

### CMAccelerometerData vs CMDeviceMotion

| | CMAccelerometerData | CMDeviceMotion |
|---|---|---|
| Source | Raw accelerometer chip | Sensor fusion (accel + gyro) |
| Gravity | Included | Separated into `.gravity` field |
| User motion | Mixed with gravity | Isolated in `.userAcceleration` |
| Best for | Raw data recording | Freefall detection, gesture recognition |

**For freefall detection, use `CMDeviceMotion.userAcceleration`.** During freefall, `userAcceleration` magnitude ≈ 0.

### Sampling rates

- Standard `CMMotionManager`: up to **100 Hz**
- `CMBatchedSensorManager` (iOS 17+): up to **800 Hz** for raw accelerometer, **200 Hz** for device motion — overkill for this use case, but available

### Info.plist key

No special permission key is required for accelerometer access alone. CoreMotion in general does not trigger a user-facing permission prompt for accelerometers (unlike location or camera).

### Background access

Motion updates **stop when the app goes to background** unless you keep the app active (e.g., with a background audio session as a hack). For a throw-height app the phone must be in active use anyway, so this is not a real constraint.

---

## 4. Freefall physics

### What the accelerometer sees

A phone sitting on a table reads **1 g** (9.81 m/s²) because the table pushes up against gravity. A phone in freefall is weightless from the accelerometer's perspective — it reads **0 g** on all axes (in the gravity-removed `userAcceleration` field, or equivalently, `accelerationIncludingGravity` magnitude ≈ 0 in the raw signal).

### Detection algorithm

```
magnitude = sqrt(ax² + ay² + az²)
if magnitude < FREEFALL_THRESHOLD:
    if not in_freefall:
        freefall_start = now()
        in_freefall = True
else:
    if in_freefall:
        freefall_end = now()
        in_freefall = False
        calculate_height(freefall_end - freefall_start)
```

`FREEFALL_THRESHOLD`: typically 0.1–0.3 g for `userAcceleration`; or < ~1 m/s² for raw acceleration magnitude (since gravity should be ~9.81 m/s², anything well below that indicates freefall).

### Height calculation

Assuming a vertical throw from and back to the same height:

```
t_freefall = total time in freefall (seconds)
t_ascent   = t_freefall / 2            (symmetry)
h          = ½ × g × t_ascent²
           = ½ × 9.81 × (t_freefall/2)²
           = 9.81 × t_freefall² / 8
           ≈ 1.226 × t_freefall²       (meters)
```

**Example**: 1 second of freefall → ~1.23 m peak height.

### Assumptions and error sources

- Symmetrical trajectory (same release and catch height). SMTH relaxes this by also using the landing impact spike.
- Negligible air resistance (reasonable for a 200 g phone at low speeds).
- Accurate start/stop detection — noise near the threshold can cause off-by-one events.
- Real throw also has horizontal velocity, which doesn't affect vertical height but means total flight time isn't purely vertical.

### Noise filtering

Raw sensor data is noisy. Common approaches:
- Low-pass filter to isolate the gravity component (for the raw signal approach)
- Require the freefall condition to hold for a minimum duration (e.g., > 50 ms) before recording it
- Debounce the landing spike

---

## 5. Deployment options

### Web app

| Platform | Cost | HTTPS | Setup effort |
|---|---|---|---|
| GitHub Pages | Free | Automatic | Push to `gh-pages` branch or `docs/` folder |
| Netlify | Free tier | Automatic | Connect GitHub repo; auto-deploys on push |
| Vercel | Free tier | Automatic | Same as Netlify |

**Testing flow**: deploy → open URL on your iPhone in Safari → tap "Grant Permission" button → test.

No App Store involvement, no Xcode required. Shareable via URL.

### iOS native app (Xcode)

- Requires a Mac with Xcode (free, ~15 GB)
- A free Apple ID lets you sideload to **your own device** directly from Xcode (no App Store needed)
  - Cable the phone → Xcode → Run. App stays on device for **7 days**, then needs re-signing.
- A **paid Apple Developer account** ($99/year) extends the certificate to 1 year and unlocks TestFlight for sharing with others.
- Simulator **does not simulate accelerometer** — you need a real device.

### Cross-platform (if you want iOS + Android from one codebase)

| Framework | Language | Accelerometer library | Notes |
|---|---|---|---|
| React Native + Expo | JavaScript / TypeScript | `expo-sensors` (`Accelerometer`) | Easiest if you know JS |
| Flutter | Dart | `sensors_plus` | Strong ecosystem, good perf |
| Capacitor + Ionic | JS/TS (web tech) | `@capacitor/motion` | Web-first; can reuse web app code |

For this project, a plain web app or a native SwiftUI app are the two most practical starting points (see plan doc).
