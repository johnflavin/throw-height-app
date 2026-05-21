# Implementation Plan: Throw Height App

## Goal

An app that:
1. Reads the phone accelerometer in real time and displays a live graph
2. Detects freefall (net acceleration ≈ 0)
3. Calculates estimated peak throw height from freefall duration
4. Displays the result

## Recommendation: Start with a web app

**Why start on the web:**
- No Xcode, no Apple Developer account, no App Store
- Deploy to GitHub Pages (free, HTTPS, shareable via URL)
- DeviceMotion API works on iOS Safari ≥ 13
- You can have something running on your phone in under an hour
- If you hit a wall (precision, background access), pivot to native iOS

The physics exploration goal doesn't require native performance. A web app at ~60 Hz is plenty to measure freefall events of ≥ 0.5 seconds, which corresponds to throws of ≥ 30 cm.

---

## Phase 1: Web app MVP

### Tech stack

- Plain HTML + CSS + JavaScript (no build step, no frameworks)
- Chart.js for the live accelerometer graph (CDN import, no install)
- Hosted on GitHub Pages

### File structure

```
throw-height-app/
├── index.html
├── style.css
├── app.js
└── README.md
```

### Features in MVP

1. **Permission button** — required for iOS; tapping it triggers `DeviceMotionEvent.requestPermission()`
2. **Live graph** — rolling 3-second window of acceleration magnitude vs. time (Chart.js line chart)
3. **Raw data display** — current x, y, z values and computed magnitude
4. **Freefall indicator** — turns red when magnitude drops below threshold
5. **Height calculator** — shows estimated peak height after each detected freefall event

### Key implementation notes

**Gravity handling**: Use `accelerationIncludingGravity` (always available) and compute the magnitude. At rest, magnitude ≈ 9.81 m/s². In freefall, magnitude ≈ 0. This avoids relying on the `acceleration` (gravity-removed) field which can be `null` on some Android devices.

```javascript
function handleMotion(event) {
  const { x, y, z } = event.accelerationIncludingGravity;
  const magnitude = Math.sqrt(x*x + y*y + z*z);
  updateGraph(magnitude);
  updateFreefallDetector(magnitude, event.timeStamp);
}
```

**Freefall threshold**: Start with `magnitude < 2.0 m/s²` (roughly 0.2 g). Tune after testing.

**Minimum freefall duration**: Ignore events shorter than 100 ms to filter noise/fumbles.

**Height formula**: `h = 9.81 * t² / 8` where `t` = freefall duration in seconds.

### Deployment (GitHub Pages)

1. Push the repo to GitHub
2. Go to repo Settings → Pages → Source: Deploy from branch `main`, folder `/` (root)
3. GitHub provides a URL like `https://<username>.github.io/throw-height-app/`
4. Open that URL on your iPhone in Safari
5. Tap "Grant Permission" → accelerometer access begins

No command line needed after initial push. Every `git push` auto-redeploys.

---

## Phase 2: Improvements (after MVP works)

These are optional enhancements once you've verified the core mechanic works:

### 2a. Better signal processing
- Implement a simple low-pass / high-pass filter to separate the static gravity component from dynamic acceleration
- Lets you display "linear acceleration" (motion only) separately from the gravity vector
- Helps visualize the orientation of the phone during the throw

### 2b. Event log
- Save a history of throw events (timestamp, freefall duration, estimated height)
- Show a personal best
- Export as CSV

### 2c. Raw data recording
- "Record" button captures a full accelerometer trace
- Replay or download as JSON for offline analysis
- Useful for tuning the freefall detection threshold

### 2d. Calibration screen
- Measure baseline noise at rest
- Auto-set threshold as `mean + 3σ` of resting magnitude

---

## Phase 3: Native iOS app (if needed)

Reasons to go native:
- Web sampling rate (~60 Hz) is insufficient for very short freefall events
- Want to run in background
- Want to distribute to others via TestFlight

### Setup steps

1. Install Xcode from the Mac App Store (free, ~15 GB)
2. Sign in with your Apple ID in Xcode (Xcode → Settings → Accounts → +)
3. Create a new project: File → New → Project → App (iOS), Swift, SwiftUI
4. In `Info.plist`, add `NSMotionUsageDescription` with a user-facing string (required by App Store but also good practice for sideloading)
5. Connect iPhone via USB; trust the computer on the phone
6. In Xcode, select your device in the run target dropdown
7. Press Run (⌘R)

On a free Apple ID, the app installs and runs for **7 days**. After 7 days, repeat step 6–7 to re-sign. For longer-lived installs, a $99/year Apple Developer account extends validity to 1 year.

### Core structure

```swift
// ContentView.swift
import SwiftUI
import CoreMotion

class MotionManager: ObservableObject {
    private let cm = CMMotionManager()
    @Published var userAccel: CMAcceleration = .init()
    @Published var freefallActive = false
    @Published var lastHeight: Double = 0

    func start() {
        cm.deviceMotionUpdateInterval = 1.0 / 100.0
        cm.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let self, let d = data else { return }
            self.userAccel = d.userAcceleration
            self.updateFreefall(d.userAcceleration)
        }
    }
}
```

The UI layer is a SwiftUI `View` that observes `MotionManager` and updates in real time.

### TestFlight (sharing with others)

Requires a paid Apple Developer account ($99/year):

1. Archive the build: Product → Archive
2. Distribute App → TestFlight & App Store → upload to App Store Connect
3. In App Store Connect, add testers by email under the TestFlight tab
4. They receive an email and install via the TestFlight app

For personal use only (you + your own devices), skip TestFlight and use direct device install.

---

## Suggested order of work

1. [ ] Build Phase 1 web app (index.html, style.css, app.js)
2. [ ] Deploy to GitHub Pages and test on iPhone
3. [ ] Tune freefall threshold and duration minimum from real data
4. [ ] Add event log and history (Phase 2b)
5. [ ] Decide whether web precision is sufficient or native iOS is needed
6. [ ] If native: follow Phase 3 Xcode setup

---

## Physics sanity checks

| Freefall time | Estimated height | Real-world meaning |
|---|---|---|
| 0.2 s | 4.9 cm | Barely a toss |
| 0.5 s | 30.6 cm | Gentle lob |
| 0.7 s | 60 cm | About waist height |
| 1.0 s | 1.23 m | Above your head |
| 1.5 s | 2.76 m | Two-story building |

SMTH's world record (as of the original app's era) was around 14+ meters — about 3.4 seconds of freefall.
