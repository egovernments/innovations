// The Ask Lenspack button while Lenspack restarts, in a headless browser, as the lenspack account:
// stop the Lenspack container, expect the button to stay (grey, "Reconnecting…"), start it again, expect the
// normal button back without a page reload. Prints one JSON line.
//
//   EXE=<chromium> PLAYWRIGHT=<path to playwright's index.mjs> SS_USER_PW=… node resilience_ui.mjs <dashboard> <container>
import { execFileSync } from "node:child_process";

const [dashboard = "6", container = "nl-dashboard-lenspack-1"] = process.argv.slice(2);
const BASE = (process.env.SUPERSET || "http://100.72.3.113:8088").replace(/\/+$/, "");
const { chromium } = await import(process.env.PLAYWRIGHT);
const docker = (...a) => execFileSync("docker", a, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

const out = { ok: false };
const browser = await chromium.launch({ executablePath: process.env.EXE });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/login/`);
  await page.fill("#username", "lenspack");
  await page.fill("#password", process.env.SS_USER_PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click("[type=submit]")]);
  await page.goto(`${BASE}/superset/dashboard/${dashboard}/`);
  const btn = page.locator(".lpo-btn");
  await btn.waitFor({ state: "visible", timeout: 60000 });
  const state = () => page.evaluate(() => {
    const b = document.querySelector(".lpo-btn");
    return b ? { visible: getComputedStyle(b).display !== "none", wait: b.classList.contains("lpo-wait"), text: b.textContent.trim() } : { visible: false };
  });
  out.before = await state();

  docker("stop", container);
  const t0 = Date.now();
  let vanished = false;
  while (Date.now() - t0 < 30000) {
    const s = await state();
    if (!s.visible) vanished = true;
    if (s.visible && s.wait) { out.reconnectingAfterMs = Date.now() - t0; out.reconnecting = s; break; }
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(3000);
  docker("start", container);
  const t1 = Date.now();
  while (Date.now() - t1 < 120000) {
    const s = await state();
    if (!s.visible) vanished = true;
    if (s.visible && !s.wait) { out.backAfterMs = Date.now() - t1; out.after = s; break; }
    await page.waitForTimeout(500);
  }
  out.vanished = vanished;
  out.ok = !!out.reconnectingAfterMs && !!out.backAfterMs && !vanished;
} catch (e) {
  out.error = String(e).slice(0, 200);
  try { docker("start", container); } catch { /* already running */ }
} finally {
  await browser.close();
}
console.log(JSON.stringify(out));
