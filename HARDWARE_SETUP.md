# Gateway and camera setup

## Run
Use Node.js 22.12+ (tested with Node 24).

```sh
npm ci
npm ci --prefix backend
```

Copy `.env.example` to `.env`, set a random JWT_SECRET, then:

```sh
npm run build
npm run start:production
```

Open http://localhost:5000. Existing demo login: `admin` / `Admin@123`.
The default demo has in-memory telemetry/users, reset on restart. Configure PostgreSQL
and replace inherited demo credentials before public use. Existing telemetry/image-read
APIs remain public; camera upload authentication is optional for firmware compatibility.
For development, `npm start` launches ports 5173 and 5000.

## Deploy
Render build: `npm ci && npm ci --prefix backend && npm run build`.
Start: `npm run start:production`. Health: `/health` or `/api/health`.
render.yaml provides an in-memory demo configuration. This ZIP does not update your
live Render service: deploy its contents there to activate these changes.

Leave VITE_BACKEND_URL blank for same-origin production hosting. If deploying frontend
separately, set VITE_BACKEND_URL to the backend origin before building and CORS_ORIGIN
to the frontend origin on the backend (no `/api` suffix).

Set CAMERA_STORAGE_DIR to an attached persistent disk's absolute mount path.
Without a persistent disk, images may disappear on redeployment. CAMERA_MAX_IMAGES
(default 100) accepts 5–1000; each image is limited to 5 MB. Use one backend instance
per directory. Multiple instances require shared object storage.
Docker includes the AI models and serves the built frontend. Compose includes a camera
volume and motion migration for new DB volumes; existing volumes need migration below.

## Node 3 compatibility
POST `/api/readings` accepts N1/N2, roll, pitch, temperature, vibration, gateway_id,
sequence, hop_count and all six accel/gyro axes. GET `/health` now aliases `/api/health`.
Point both firmware URLs at this updated deployment. Motion units are retained as sent
by firmware, not assumed or converted. Missing axes show “Not reported”. Tilt is degrees.
The gateway sends no acquisition timestamp, so the server uses receipt time.

## ESP32-CAM upload contract
Node 3 calls the camera's LOCAL `/capture?angle=45&flash=1`. That camera handler must
capture a JPEG and POST it to the public server. The public web server cannot reach
your private camera IP. No ESP32-CAM sketch was supplied, so its behavior is unverified.

Send raw JPEG bytes, not multipart or base64:

```text
POST https://YOUR-SERVICE.onrender.com/upload?angle=45
Content-Type: image/jpeg
X-Camera-Token: YOUR_TOKEN (only if CAMERA_UPLOAD_TOKEN is configured)

<binary JPEG>
```

`/api/camera/upload` is an alias. X-Camera-Angle is also supported, query takes precedence;
missing angle defaults to 0. Range: 0–180. Success: HTTP 201,
`{success:true,image:{id,angle,capturedAt,url}}`.
Camera firmware should reply successfully to Node 3 only after successful image upload.

With frame buffer `fb`, angle, and WiFiClientSecure `client` configured with a trusted CA:

```cpp
HTTPClient http;
http.begin(client, String(PORTAL_ORIGIN) + "/upload?angle=" + String(angle));
http.addHeader("Content-Type", "image/jpeg");
// http.addHeader("X-Camera-Token", CAMERA_UPLOAD_TOKEN);
int code = http.POST(fb->buf, fb->len);
http.end();
bool uploaded = code >= 200 && code < 300;
```

Gallery refreshes every five seconds, filters by angle, shows receipt times and links
full images. It displays the latest 30 matching images; API lists all retained files.
Socket.IO emits cameraImage for uploads. This is snapshots, not video or crack detection.
Upload validation checks MIME type, size and JPEG boundary markers, not full decoding.

## Database
With DB_ENABLED=true and DATABASE_URL configured, run `node backend/db/init.js`.
Alternatively apply backend/db/motion_schema.sql to an existing DB using its SQL console.
This adds six nullable columns without deleting data. Raw telemetry history includes
motion axes; existing minute aggregates do not aggregate those axes.
Live PostgreSQL migration was not tested in this environment.

## Firmware requirements remain
- N1/N2 must use your gateway's exact 56-byte SensorPacket. Bundled legacy firmware uses
  a different MeshPacket: do not mix implementations without adapting both ends.
- All nodes must use the gateway access point's ESP-NOW channel.
- Node 3's blocking 90-second camera waits can overflow its 40-packet queue. Move camera
  work off the sensor-upload loop and add bounded upload retries in firmware.
- A website cannot recover packets discarded on ESP32 or verify physical motor position.

## Tests
`npm run test:hardware`: 32 assertions for sensor fields, uploads, retrieval, validation,
Socket.IO events, optional token and concurrent retention.
`DB_ENABLED=false node backend/test-gateway-compatibility.js`: 27 assertions.
`DB_ENABLED=false node backend/test-backend.js`: 21 assertions.
`npm run build`: production bundle.
These use synthetic readings locally, not your live deployment or physical hardware.

Production routes were HTTP smoke-tested. Browser visual testing was not completed because a browser executable was unavailable.

## Live-only update
Read LIVE_ONLY_UPDATE.md first for the latest startup behavior and deployment steps. No readings are prepopulated.
