// Run: deno run -A --no-lock tests/timer-controls.mjs
// Mocks Orcha's bootstrap and Timer API; checks the native break-timer dialog.
import { chromium } from "npm:playwright@1.63.0";
const root = new URL("../", import.meta.url);
const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (request) => {
  const pathname = new URL(request.url).pathname;
  const file = new URL(`.${pathname === "/" ? "/index.html" : pathname}`, root);
  if (!file.href.startsWith(root.href)) return new Response("Not found", { status: 404 });
  try {
    const type = { html: "text/html", js: "text/javascript", css: "text/css", png: "image/png" }[file.pathname.split(".").pop()] || "application/octet-stream";
    return new Response(await Deno.readFile(file), { headers: { "Content-Type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});
const check = (value, message) => { if (!value) throw Error(message); };
const ORCHA = "https://orcha.test";
let browser;
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") || "/home/sensui/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.addr.port}/`;
  let timer = { pc: "PC3", tournamentId: "t1", durationMs: 1_800_000, remainingMs: 1_800_000, endsAt: null, running: false, visible: true };
  let assigned = true;
  const actions = [];
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "X-BadukCast-Key, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORCHA) {
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const json = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/v1/bootstrap") return json(200, { tournament: { id: "t1", name: "Test Cup" }, games: [], overlaySettings: {} });
      if (url.pathname === "/timer/PC3/state") return assigned ? json(200, timer) : json(403, { error: "Timer is not assigned to a tournament" });
      if (url.pathname === "/timer/PC3/action") {
        check(request.headers()["x-badukcast-key"] === "ABCDEFGH", "commentary code sent as header");
        check(!url.href.includes("ABCDEFGH"), "code not in URL");
        const body = JSON.parse(request.postData());
        actions.push(body);
        if (body.action === "start") timer = { ...timer, durationMs: body.seconds * 1000, remainingMs: body.seconds * 1000, running: true, visible: true };
        if (body.action === "pause") timer = { ...timer, running: false };
        if (body.action === "hide") timer = { ...timer, visible: false };
        return json(200, timer);
      }
      return json(404, { error: "not found" });
    }
    if (url.origin === new URL(base).origin) return route.continue();
    return route.fulfill({ contentType: "text/html", body: "" });
  });

  // Legacy control-link parameter maps to the PC selector.
  await page.goto(`${base}?role=CO&label=Test&Network=timer-test&aiOrigin=${encodeURIComponent(ORCHA)}&Timer=${encodeURIComponent("https://orcha.test/timer/PC3/control")}`);
  await page.waitForFunction(() => !!window.timerControls && !!window.generateViewerUrl);
  check(await page.locator("#TimerPc").inputValue() === "PC3", "legacy Timer link selects PC3");

  // Before a tournament is loaded the dialog explains what to do and stays disabled.
  await page.locator("#openTimer").evaluate((b) => b.click());
  check((await page.locator("#timerStatus").textContent()).includes("commentary code"), "asks for commentary code first");
  check(await page.locator("#timerStart").isDisabled(), "start disabled without code");
  await page.locator("#closeTimer").click();

  // Load the tournament, then control the timer.
  // Commentator links open a fresh page: unlock with the code inside the dialog.
  await page.locator("#openTimer").evaluate((b) => b.click());
  check(await page.locator("#timerCodeForm").isVisible(), "code field shown in dialog");
  await page.locator("#timerCode").fill("abcdefgh");
  await page.getByText("Unlock timer").click();
  await page.waitForFunction(() => window.tournamentAccessKey === "ABCDEFGH");
  check(!(await page.locator("#timerCodeForm").isVisible()), "code field hidden after unlock");
  await page.waitForFunction(() => document.getElementById("timerTime").textContent === "30:00");
  check(await page.locator("#timerMinutes").inputValue() === "30", "duration prefilled from server");
  check(await page.locator("#timerStatus").textContent() === "PC3: Paused", "paused status");
  check(await page.locator('[data-timer-action="pause"]').isDisabled(), "pause disabled while paused");

  await page.locator("#timerMinutes").fill("5");
  await page.locator("#timerSeconds").fill("0");
  await page.locator("#timerStart").click();
  await page.waitForFunction(() => document.getElementById("timerStatus").textContent === "PC3: Running");
  check(JSON.stringify(actions[0]) === JSON.stringify({ action: "start", seconds: 300 }), "start sends seconds");
  check(/^0[45]:\d\d$/.test(await page.locator("#timerTime").textContent()), "counting from 5:00");
  check(!(await page.locator('[data-timer-action="pause"]').isDisabled()), "pause enabled while running");

  await page.locator('[data-timer-action="pause"]').click();
  await page.waitForFunction(() => document.getElementById("timerStatus").textContent === "PC3: Paused");
  await page.locator('[data-timer-action="hide"]').click();
  await page.waitForFunction(() => document.getElementById("timerStatus").textContent.includes("Hidden on stream"));
  check(await page.locator('[data-timer-action="hide"]').isDisabled(), "hide disabled when hidden");
  check(!(await page.locator('[data-timer-action="show"]').isDisabled()), "show enabled when hidden");

  // Shared links carry the PC, never the code.
  await page.evaluate(() => window.updateShareableUrl?.());
  const shared = await page.evaluate(() => location.href + " " + (document.getElementById("shareableUrl")?.value || ""));
  check(!shared.includes("ABCDEFGH"), "code not in shared URL");

  // Unassigned PC gives a clear message.
  await page.locator("#closeTimer").click();
  assigned = false;
  await page.locator("#openTimer").evaluate((b) => b.click());
  await page.waitForFunction(() => document.getElementById("timerStatus").textContent.includes("not assigned"));
  check(await page.locator("#timerStart").isDisabled(), "controls disabled when unassigned");

  check(errors.length === 0, `page errors: ${errors.join("; ")}`);
  console.log("Timer control checks passed: PC selection, code gating, start/pause/hide/show, unassigned PC, and code privacy.");
} finally {
  await browser?.close();
  await server.shutdown();
}
