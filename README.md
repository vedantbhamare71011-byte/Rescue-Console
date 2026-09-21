# Rescue Console

A laptop-local search-and-rescue presentation prototype with separate **Demo sandbox** and **Realtime** modes. No ROS, AI detection, MAVLink control, sensor calibration, physical flight or survivor-detection capability is claimed. It does not open serial ports or interfere with the ESP32.

## Run on another laptop

Extract the supplied portable ZIP, or copy the source folder including `web/vendor` but excluding `server.local.*` logs (the local log contains a private producer token). Install Python **3.9 or newer** and use a modern WebGL2-capable browser. There are no pip or npm dependencies to install. All graphics assets are local; no internet is required at runtime.

- Windows: double-click `start.bat`, or run `python server.py` in this folder.
- macOS / Linux: `sh start.sh`, or `python3 server.py`.
- Open **http://127.0.0.1:8787**. Keep the server terminal open. Ctrl+C stops it.
- For a busy port: `python server.py --port 8790`, then open that port instead.

Only Windows has been exercised in this session; macOS/Linux portability is by design, not a tested claim. This is a local presentation server, not a production or safety-critical deployment.

## Judge demonstration (2 minutes)

1. Open **Demo sandbox**. Explain the amber simulation label and the fact that figures/hazards are pre-placed fixtures.
2. Click **Take off**, then click the 3D viewport. **WASD** translates relative to drone heading, **R/F** rises/descends, **Q/E** turns, **Shift** moves faster, **Space** cancels the route and holds position.
3. Try **Follow**, **Top**, and drag/scroll in **Orbit**. The onboard view is rendered from the virtual drone; the thermal view is only an illustrative palette, not measured temperature.
4. Click **Run demo mission** for a scripted virtual survey and landing. Manual input interrupts the route. Pause/Resume and Reset work only in Demo. The simulation pauses when the tab is hidden or a guide dialog is opened.
5. Click annotations to inspect fictional rescue/hazard/assembly points. Export the session log as JSON if desired.
6. Switch to **Realtime**. Without a telemetry producer, it shows **No telemetry connected**, not fake movement. Hardware controls are disabled. Show the architecture dialog to explain implemented versus planned components.

Flight dynamics are deliberately simplified: bounded translation, heading, altitude, basic obstacle bounds, and scripted waypoints. Not a flight simulator suitable for pilot training or controller validation. The drone is drawn larger than a typical small quadcopter for readability.

## Realtime telemetry interface

The server binds only to `127.0.0.1`. A random producer token is printed in its terminal at each start. Alternatively set `RESCUE_TOKEN` in the server environment to use a private token of your choice. Do not commit tokens or share them in screenshots. The web page never receives this token. No endpoint sends physical flight commands.

Post JSON to `/api/telemetry` with `Authorization: Bearer <token>`:

```json
{
  "source": "jetson-telemetry-bridge",
  "position": {"east": 0.0, "north": 0.0, "up": 2.5},
  "attitude": {"roll": 0.0, "pitch": 0.0, "yaw": 90.0},
  "battery": 86.0,
  "speed": 0.4
}
```

Coordinate contract: local **East, North, Up** in meters, fixed origin defined by the producer. `up` is not assumed to be height above terrain. Attitude in degrees: yaw clockwise from north (90 east), pitch positive nose up, roll positive right-wing down. The viewport uses X=east, Y=up, Z=-north. The visual model center sits 0.6 m above reported position. The Realtime grid is a reference plane, **not a reconstructed or surveyed map**. Do not pass latitude/longitude, NED coordinates or raw quaternion components as ENU.

Position/source are required; attitude defaults to zero when omitted. Battery and speed are optional and display unknown when absent. The producer is responsible for sensor timestamps, coordinate conversion and validity; do not keep replaying an old reading as if it were fresh. Only arrival freshness is measured by this prototype. Samples become stale after 3 seconds; the last-known pose is held and explicitly marked stale. Restart clears all samples. Data is in memory, not persisted.

`bridge.py` accepts one JSON object per line on stdin. Set `RESCUE_TOKEN` in its environment, then pipe your actual telemetry-conversion program into it:

```text
your-telemetry-producer | python bridge.py
```

`your-telemetry-producer` is a placeholder, not supplied executable code. An actual Pixhawk/ROS/Jetson adapter still needs to be implemented and tested against your hardware. The bridge does not create measurements.

### Jetson on a different network

Once SSH is authorized and working, an optional reverse tunnel avoids exposing a LAN HTTP service or changing Raptor's inbound firewall settings:

```text
ssh -N -o ExitOnForwardFailure=yes -R 18787:127.0.0.1:8787 jetson@100.114.108.55
```

An authorized producer on the Jetson can then POST to `http://127.0.0.1:18787/api/telemetry` using the laptop server token. Forwarding must be permitted by the SSH server. This tunnel has not been verified here. Do not change network/security policy to make it work without approval.

### Optional image input

POST JPEG bytes to `/api/frame/rgb` or `/api/frame/thermal` with the same Bearer token and `Content-Type: image/jpeg`. Maximum 2 MB/frame. The dashboard fetches the latest frame roughly 3 times per second; this is a low-rate preview, not a synchronized video system. Frames older than 3 seconds are hidden. Thermal JPEGs are display images only; no radiometric temperature analysis is implemented. No camera feeds are connected by default.

### Tests

```text
python -m unittest -v test_server.py
node --test test_simulation.js
```

Node is only needed for simulation unit tests, not to run the application. Tests use explicitly synthetic fixtures and do not prove real drone/sensor performance.

## Third-party software

Three.js **0.160.1**, including OrbitControls, is vendored under the MIT license. See `web/vendor/THREE-LICENSE.txt`. Sources: https://www.npmjs.com/package/three/v/0.160.1 and https://threejs.org/docs/ . No external fonts, textures, analytics or runtime CDNs.
