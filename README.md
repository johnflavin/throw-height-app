# Throw Height App

Exploring the science behind "Send Me to Heaven" — live accelerometer data, freefall detection, and vertical throw height estimation in a web app.

## Docs

- [api-research.md](api-research.md) — DeviceMotion API, iOS CoreMotion, freefall physics, deployment options
- [plan.md](plan.md) — implementation plan (web-first, then native iOS if needed)

## Live app

> Once deployed (see below), open the URL on your iPhone in Safari.

## Deploy to GitHub Pages (free, HTTPS, no build step)

### First time

1. Push this directory to a GitHub repository (create one at github.com if needed):
   ```
   git remote add origin https://github.com/<your-username>/throw-height-app.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Set branch: `main`, folder: `/ (root)`. Click Save.
5. After ~60 seconds, GitHub shows a URL:
   `https://<your-username>.github.io/throw-height-app/`

### Every subsequent update

```
git add -A
git commit -m "your message"
git push
```

GitHub Pages re-deploys automatically on every push. Takes ~30–60 seconds.

### Testing on iPhone

1. Open the deployed HTTPS URL in **Safari** (not Chrome — iOS Chrome uses WebKit but some features behave differently).
2. Tap **Start**. iOS will show a permission dialog: "Allow [site] to use your motion and orientation?"
3. Tap **Allow**.
4. The live chart and state indicator should begin updating immediately.

> The permission prompt only appears once per site per iOS session. If you accidentally deny it, go to Settings → Safari → clear website data, then reload.

## What the app shows

| Element | Description |
|---|---|
| State banner | **REST** / **MOTION** / **FREEFALL** — changes color and label in real time |
| Freefall time | Timer ticking up while in freefall state |
| Est. peak height | Calculated once freefall ends: `h = g·t²/8` |
| Live chart | Blue: `|accelerationIncludingGravity|` magnitude · Orange: `|acceleration|` magnitude (gravity-removed, if available) |
| Reference lines | Dashed blue at 2 m/s² (freefall threshold) · Dashed green at 9.81 m/s² (1 g) |
| Sensor readings | x/y/z components, both magnitudes, sample interval, 1-second variance |
| Throw history | Time, freefall duration, and estimated height for each recorded event |

## Files

```
index.html   — markup
style.css    — dark mobile-first styles
app.js       — DeviceMotion listener, state machine, Chart.js integration
```

No build step, no npm, no dependencies beyond two CDN scripts (Chart.js + annotation plugin).
