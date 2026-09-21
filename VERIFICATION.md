# Verification boundary

## Observed in this build session

- Python HTTP/API suite: 13 tests passed; final server suite passed three consecutive runs.
- JavaScript simulation suite: 8 tests passed, including a complete route and landing, keyboard movement, pause, collision bounds, altitude limits and route interruption.
- BrowserOS on Windows: actual WebGL scene and rendered camera panels loaded.
- Browser Take off action reached 5.0 m; keyboard input changed north coordinate from -22.0 m to -18.0 m.
- Follow camera selected and rendered; no horizontal overflow at the tested laptop viewport.
- Realtime without a producer showed no connected telemetry and disabled flight controls.
- Authenticated synthetic integration input displayed E=6, N=8, U=12 m, heading 090 degrees and the source `INTEGRATION TEST / synthetic`.
- Labelled 320-pixel JPEG test fixtures loaded in both external-camera panels. Both disappeared on expiry.
- Stale telemetry held last-known coordinates, cleared live metrics, and displayed the stale warning.
- No browser runtime errors were captured during these interactions. All recorded resource requests were local.
- Browser mission progressed through multiple waypoints; switching away paused it as designed. Full mission completion was verified in the simulation unit test, not an uninterrupted browser presentation.
- Tailscale SSH authorization completed; read-only hostname/user/uptime commands succeeded on jetson-desktop as jetson.

## Not verified or implemented

- No physical drone, Pixhawk, motor, ESP32, camera, thermal sensor, LiDAR or GPS input was used.
- No live person detection, rescue accuracy, SLAM, obstacle sensing or physical drone control is implemented.
- No firmware was flashed, serial port acquired, or other project's tests stopped.
- No code was deployed to the Jetson. The optional reverse SSH forwarding path has not been exercised.
- macOS/Linux launch and mobile layouts have not been exercised. Runtime is designed for Python 3.9+ with a modern WebGL2 browser.

The Realtime API is working with test fixtures. Real telemetry requires a hardware-specific producer implementing the documented ENU contract. It must not be represented as hardware-validated.
