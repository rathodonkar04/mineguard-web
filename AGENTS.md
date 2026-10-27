# Antigravity Agent Guidelines: MineGuard Project

## 1. Execution Framework
- This repository operates under the **GSD (Get Stuff Done)** spec-driven framework.
- Always review `.planning/PROJECT.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` before initiating major modifications.
- Keep changes atomic, verifiable, and token-efficient.

## 2. Playwright MCP Integration
- Playwright MCP is configured in `.agents/mcp_config.json` and `.agents/plugins/playwright/mcp_config.json`.
- The MCP server uses the local system Chrome executable (`C:\Program Files\Google\Chrome\Application\chrome.exe`) in headless mode.
- Use Playwright MCP for end-to-end browser inspection, DOM snapshots, and verifying the dashboard on `http://localhost:5173`.

## 3. Project Architecture
- **Backend**: Express + Socket.IO server at `http://localhost:5000`. Telemetry ingest via `POST /api/telemetry` and `POST /api/readings`.
- **Frontend**: Vite + React 19 dashboard at `http://localhost:5173`.
- **Unified Run**: `npm start` launches both frontend and backend concurrently.
- **Verification Commands**:
  - `node backend/test-backend.js`
  - `npm run build`
