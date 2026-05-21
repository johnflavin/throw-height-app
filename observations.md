# Sensor Observations

Empirical notes from testing the app, with physics interpretation.

---

## What the two signals mean

The DeviceMotion API exposes two acceleration properties:

| App label | API property | MDN description |
|---|---|---|
| `\|a+g\|` | `accelerationIncludingGravity` | "measures the g-force… the raw data measured by an accelerometer" |
| `\|a\|` | `acceleration` | "does not include the effect of the gravitational force" — computed by subtracting an estimated gravity vector |

### What a MEMS accelerometer actually measures

A MEMS accelerometer measures **proper acceleration** (also called specific force): the contact/mechanical force per unit mass acting on the sensor's proof mass. Gravity alone — when nothing else is touching the device — produces *no* proper acceleration.

This is why the naming `accelerationIncludingGravity` is confusing and MDN itself flags it: it is the *raw sensor output*, and that output is dominated by contact forces (normal force, hand force), not by gravity directly.

`acceleration` (the "gravity-removed" value) is computed by the OS using gyroscope fusion to estimate and subtract the static gravity component. The result is the device's **coordinate acceleration** — how it is actually moving through space, as an external inertial observer would measure.

---

## Observed behavior

### At rest on a stable surface

- `|a+g|` ≈ **9.8 m/s²**
- `|a|` ≈ **0 m/s²**

The surface exerts a normal (contact) force on the phone equal to *mg* upward, which is what the raw sensor measures. The phone is not accelerating in space, so coordinate acceleration is 0. `acceleration` (gravity subtracted) correctly reflects this.

### In freefall

- `|a+g|` ≈ **0 m/s²**
- `|a|` ≈ **9.8 m/s²**

No surface is touching the phone, so there is no contact force and proper acceleration = 0. The raw sensor reads ~0. The OS then subtracts its gravity estimate (pointing downward, ≈ −9.8 m/s²), yielding `acceleration` ≈ +9.8 m/s² (directed upward, opposite to gravity). This represents the phone's actual kinematic acceleration through space, which is gravitational free-fall at 9.8 m/s² downward.

---

## Summary table

| Situation | Proper accel (`\|a+g\|`) | Coordinate accel (`\|a\|`) |
|---|---|---|
| At rest on surface | ~9.8 m/s² (normal force) | ~0 m/s² (not moving) |
| In freefall | ~0 m/s² (no contact) | ~9.8 m/s² (gravitational fall) |
| Being thrown upward | > 9.8 m/s² (hand force + reaction) | > 0 m/s² (accelerating) |

The two signals are complementary and their roles are essentially swapped from what the API names suggest.

---

## Implication for freefall detection

The app detects freefall by watching `|a+g|` (proper acceleration) drop below 2 m/s². This is the right signal: proper acceleration goes to ~0 in freefall because contact forces vanish.

Using `|a|` (coordinate acceleration) as the freefall detector would be backwards — it *rises* to ~9.8 m/s² in freefall.

---

## Naming confusion in the MDN API

MDN acknowledges the confusing names directly:

> *"The property's name can be misleading. It represents acceleration including the effects of gravity."*

A clearer naming would be:

| API name | Clearer name |
|---|---|
| `accelerationIncludingGravity` | `properAcceleration` / `specificForce` |
| `acceleration` | `coordinateAcceleration` / `kinematicAcceleration` |

---

## Sources

- [MDN: DeviceMotionEvent.accelerationIncludingGravity](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/accelerationIncludingGravity)
- [MDN: DeviceMotionEvent.acceleration](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/acceleration)
- [Wikipedia: Proper acceleration](https://en.wikipedia.org/wiki/Proper_acceleration) — "objects in a state of inertial motion experience no proper acceleration. This state is also known as 'zero gravity' or 'free fall.'"
- [Wikipedia: Accelerometer](https://en.wikipedia.org/wiki/Accelerometer) — "An accelerometer measures proper acceleration, also called specific force."
