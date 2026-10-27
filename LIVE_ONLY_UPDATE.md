# Remove mock readings — deployment update

This release starts with no sensor readings and no sample alerts. Sensors are registered
only after accepted telemetry. `/api/demo/simulate` and `/api/demo/reset` return HTTP 410.
`/health` identifies this version with `mode: "live-only"` and `demoEnabled: false`.

The dashboard now opens in a waiting state. Its live navigation contains Monitor,
Alerts, Camera and Settings. Demo progression, simulated forecasts/maps and fabricated
network metrics are not displayed. N1 and N2 have separate real-reading charts; N3 is
shown as the forwarding gateway. Camera uploads and gallery remain available.

No reading is not the same as zero: missing fields say “Not reported”, while actual
zero measurements display 0.00. Disconnected readings remain visible as last known,
not current. Receipt timestamps and sequence numbers come from accepted telemetry.
Live charts contain recent readings from the current browser session, not generated
history. No telemetry API response is cached by the service worker.

## Update your existing local/GitHub project

Copy this release's files into the project folder you already use with GitHub.
Keep your existing `.git` folder and `.env` credentials. Do not run git init or add a
new origin. In that project's terminal:

```sh
npm ci
npm ci --prefix backend
npm run build
git add .
git commit -m "Remove mock readings and enable live-only monitoring"
git push
```

Deploy that commit on your existing Render service. The commands remain:
- Build: `npm ci && npm ci --prefix backend && npm run build`
- Start: `npm run start:production`

Verify `/health` reports `mode: "live-only"`. Refresh the site with Ctrl+Shift+R.
If an old service worker still serves the previous interface, use browser developer
tools > Application > Service Workers > Unregister, then reload.

If DB_ENABLED=true, run `node backend/db/init.js` or apply
`backend/db/motion_schema.sql` to your database. This also makes unreported channels
nullable. Existing saved history is not deleted. Old simulated records in an existing
DB cannot always be distinguished from real readings; review those separately before
any deletion. The dashboard does not load those records into its live chart.

Before the first hardware upload, `/api/sensors` should return an empty sensors array.
After Node 3 posts N1/N2 readings, those nodes appear. The website cannot create or
recover readings from disconnected hardware.

## Validation
- 32 camera/hardware integration assertions passed.
- 27 gateway compatibility assertions passed.
- 21 core backend assertions passed (updated for empty startup and disabled simulation).
- Live-only tests cover empty state, missing values, real zero, offline state and reset.
- Frontend data checks cover no fallback samples, separate N1/N2 series and deduplication.
- Server-rendered dashboard waiting state and production build passed.
- Browser visual testing and physical hardware testing were not performed.
