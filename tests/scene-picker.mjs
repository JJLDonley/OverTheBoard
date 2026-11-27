// Run: deno run -A --no-lock tests/scene-picker.mjs
// Serves this repository itself, mocks BadukCast's scene template API and the
// VDO/OBS relay, and checks the Scenes window. Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE.
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
const full = { x: 0, y: 0, width: 1920, height: 1080, visible: true };
const template = {
  version: 1,
  updatedAt: "2026-11-01T00:00:00Z",
  scenes: [
    { name: "Main", sources: [
      { name: "Main page", kind: "browser", url: "https://app.baduk.club/stream-overlay/{pc}", ...full },
      { name: "Clock bar", kind: "color", color: "#000000CC", x: 0, y: 970, width: 1920, height: 110, visible: true },
      { name: "Hidden", kind: "browser", url: "https://app.baduk.club/hidden/{pc}", ...full, visible: false },
      { name: "Bad scheme", kind: "browser", url: "javascript:alert(1)", ...full },
    ] },
    { name: "Intro", sources: [{ name: "Intro page", kind: "browser", url: "https://app.baduk.club/intro/{pc}", ...full }] },
    { name: "Hosts", sources: [{ name: "Hosts page", kind: "browser", url: "https://app.baduk.club/hosts/{pc}", ...full }] },
    { name: "Interview", sources: [{ name: "Interview page", kind: "browser", url: "https://app.baduk.club/interview/{pc}", ...full }] },
    { name: "Break & Ads", sources: [
      { name: "Sponsor", kind: "browser", url: "https://sponsor.test/loop?pc={pc}", sameOnEveryPc: true, x: 960, y: 0, width: 960, height: 540, visible: true },
    ] },
  ],
};
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
  let templateUp = true;
  let templateRequests = 0;
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "X-BadukCast-Key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  const streamCalls = [];
  let dialogs = 0;
  page.on("dialog", (dialog) => { dialogs++; dialog.accept(); });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORCHA) {
      // Badukcast's commentator stream API: start/stop are done by the server.
      const stream = /^\/stream\/PC(\d+)\/(start|stop)$/.exec(url.pathname);
      if (stream) {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        streamCalls.push({ pc: stream[1], action: stream[2], key: route.request().headers()["x-badukcast-key"], method: route.request().method() });
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ pc: Number(stream[1]), running: stream[2] === "start", phase: stream[2] === "start" ? "ingesting" : "stopped", error: null }) });
      }
      if (url.pathname === "/broadcaster/api/template") {
        templateRequests++;
        if (!templateUp) return route.fulfill({ status: 500, headers: cors, body: "down" });
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ template }) });
      }
      return route.fulfill({ status: 404, headers: cors, body: "" });
    }
    if (url.origin === new URL(base).origin) return route.continue();
    // A fake VDO relay: commands are captured; confirmation is sent separately.
    return route.fulfill({ contentType: "text/html", body: `<script>
      window.commands = [];
      addEventListener('message', event => {
        if (event.data.obsCommand) commands.push(event.data);
      });
    </script>` });
  });
  const commentator = (extra = {}) => `${base}?${new URLSearchParams({
    role: "CO", label: "Preview", Network: "preview", obs: "https://vdo.ninja/?room=preview", aiOrigin: ORCHA, ...extra,
  })}`;
  const names = template.scenes.map((scene) => scene.name);
  const cardNames = () => page.locator(".scene-preview-card strong").allTextContents();

  // Cards follow the template, including a fifth custom scene.
  await page.goto(commentator({ miniPc: "5" }));
  await page.waitForFunction(() => !!window.obsController && !!window.cursorLabel && !!window.scenePicker);
  await page.locator("#openScenes").click();
  await page.waitForFunction((count) => document.querySelectorAll(".scene-preview-card").length === count, names.length);
  check(JSON.stringify(await cardNames()) === JSON.stringify(names), `cards follow template order: ${await cardNames()}`);
  check(!(await page.locator("#scenePickerStatus").textContent()).includes("default scenes"), "no fallback note when template loads");

  // Composite preview: browser iframe and colour box positioned on the 1920×1080 canvas, {pc} replaced.
  const main = page.locator(".scene-preview-card").first();
  await page.waitForFunction(() => document.querySelector(".scene-preview-card iframe")?.getAttribute("src"));
  const frames = await main.locator("iframe").evaluateAll((list) => list.map((frame) => ({
    src: frame.getAttribute("src"), sandbox: frame.getAttribute("sandbox"), style: frame.style.cssText,
    pointer: getComputedStyle(frame).pointerEvents,
  })));
  check(frames.length === 1, `hidden and non-http sources skipped (${frames.length} frames)`);
  check(frames[0].src === "https://app.baduk.club/stream-overlay/5", `pc replaced: ${frames[0].src}`);
  check(frames[0].sandbox === "allow-scripts allow-same-origin", "preview iframe sandboxed");
  check(frames[0].pointer === "none", "preview iframe ignores pointer");
  check(/left: 0px; top: 0px; width: 1920px; height: 1080px/.test(frames[0].style), `iframe geometry: ${frames[0].style}`);
  const bar = await main.locator("div.scene-preview-layer").evaluate((box) => ({ style: box.style.cssText, color: getComputedStyle(box).backgroundColor }));
  check(/left: 0px; top: 970px; width: 1920px; height: 110px/.test(bar.style), `colour box geometry: ${bar.style}`);
  check(bar.color === "rgba(0, 0, 0, 0.8)", `colour box colour: ${bar.color}`);
  const scale = await main.locator(".scene-preview-canvas").evaluate((canvas) => canvas.style.transform);
  check(/^scale\(0\.\d+\)$/.test(scale), `canvas scaled: ${scale}`);
  const sponsor = page.locator(".scene-preview-card").nth(4).locator("iframe");
  await sponsor.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll(".scene-preview-card")[4].querySelector("iframe").getAttribute("src"));
  check(await sponsor.getAttribute("src") === "https://sponsor.test/loop?pc={pc}", "sameOnEveryPc keeps {pc}");
  check(/left: 960px; top: 0px; width: 960px; height: 540px/.test(await sponsor.evaluate((f) => f.style.cssText)), "custom source geometry");

  // Clicking sends the relay command for that scene name; Live waits for OBS confirmation.
  // The OBS frame is attached asynchronously; wait until it has a document.
  const obsFrame = async () => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const frame = await (await page.locator("#obs").elementHandle()).contentFrame();
      if (frame && await frame.evaluate(() => Array.isArray(window.commands)).catch(() => false)) return frame;
      await page.waitForTimeout(100);
    }
    const frame = await (await page.locator("#obs").elementHandle()).contentFrame();
    throw Error(`OBS relay frame did not load: src=${await page.locator("#obs").getAttribute("src")} frameUrl=${frame?.url()} page=${page.url().slice(0, 160)}`);
  };
  const relay = await obsFrame();
  // The relay speaks VDO.Ninja's real message shape: { action, value, UUID }
  // with the sender's UUID on the message, scene data in value.details
  // (currentScene is an object) and `streaming` beside details. A lost OBS is
  // reported by a `tally` event, not by a flag inside details.
  const state = async (currentScene, connected = true) => {
    await relay.evaluate(({ currentScene, connected, scenes }) => parent.postMessage(connected
      ? {
        action: "obs-state", UUID: "fake-obs",
        value: { visibility: true, sourceActive: true, details: { controlLevel: 5, scenes, currentScene: { name: currentScene, width: 1920, height: 1080 } } },
      }
      : { action: "tally", UUID: "fake-obs", value: { source: "remote", UUID: "fake-obs", connected: false, obsState: {} } },
    "*"), { currentScene, connected, scenes: names });
    await page.waitForFunction((connected) => window.obsController.isConnected === connected, connected);
  };
  await state("Unlisted scene");
  check(await page.evaluate(() => window.obsController.connectionUUID) === "fake-obs", "sender UUID read from the message");
  check(await page.evaluate(() => window.obsController.controlLevel) === 5, "OBS page permission level read");

  // A host who joins while OBS is already live gets `streaming` beside
  // `details`; the button must offer Stop, and Start again once it ends.
  const toggle = page.locator("#obsStreamToggle");
  check(await toggle.textContent() === "Start Stream" && await toggle.isEnabled(), "Start Stream offered when idle");
  await relay.evaluate(() => parent.postMessage({
    action: "obs-state", UUID: "fake-obs",
    value: { streaming: true, details: { controlLevel: 5, currentScene: { name: "Unlisted scene" } } },
  }, "*"));
  await page.waitForFunction(() => document.getElementById("obsStreamToggle").textContent === "Stop Stream");
  // With a Badukcast server, Stop and Start go to the server with the
  // commentary key: only it can end the YouTube broadcast or create a new one.
  await page.evaluate(() => { window.tournamentAccessKey = "StateGoOpen2026"; });
  await page.evaluate(() => document.getElementById("obsStreamToggle").click());
  await page.waitForFunction(() => document.getElementById("obsStreamToggle").textContent === "Start Stream");
  check(JSON.stringify(streamCalls) === JSON.stringify([{ pc: "5", action: "stop", key: "StateGoOpen2026", method: "POST" }]), `stop sent to the server: ${JSON.stringify(streamCalls)}`);
  check(dialogs === 1, "stop asks for confirmation");
  check(await relay.evaluate(() => commands.filter((command) => /Streaming$/.test(command.obsCommand.action)).length) === 0, "OBS is not told to stop behind the server's back");
  await relay.evaluate(() => parent.postMessage({ action: "obs-state", UUID: "fake-obs", value: { streaming: false } }, "*"));
  await page.evaluate(() => document.getElementById("obsStreamToggle").click());
  await page.waitForFunction(() => document.getElementById("obsStreamToggle").textContent === "Stop Stream");
  check(streamCalls.length === 2 && streamCalls[1].action === "start" && streamCalls[1].pc === "5", "start sent to the server for this mini-PC");
  await relay.evaluate(() => { parent.postMessage({ action: "obs-state", UUID: "fake-obs", value: { streaming: false } }, "*"); commands.length = 0; });
  await page.waitForFunction(() => document.getElementById("obsStreamToggle").textContent === "Start Stream");
  for (const [index, name] of names.entries()) {
    await page.locator(".scene-preview-card").nth(index).click();
    await relay.waitForFunction((count) => commands.length === count, index + 1);
    const command = await relay.evaluate(() => commands.at(-1));
    check(command.obsCommand.action === "setCurrentScene" && command.obsCommand.value === name && command.UUID === "fake-obs", `${name} relay command`);
    check(!await page.locator(".scene-preview-card").nth(index).evaluate((card) => card.classList.contains("active")), "wait for confirmation");
    await state(name);
    await page.waitForFunction((name) => document.querySelector(".scene-preview-card.active strong")?.textContent === name, name);
    check(await page.locator(".scene-preview-card.active .scene-card-state").textContent() === "Live", `${name} Live indicator`);
  }
  // Real VDO sends empty details and visibility-only messages after its
  // initial scene list; those must not disable working scene controls.
  await relay.evaluate(() => {
    parent.postMessage({ action: "obs-state", value: { details: {} } }, "*");
    parent.postMessage({ action: "obs-state", value: { visibility: true } }, "*");
  });
  await page.waitForTimeout(100);
  check(await page.evaluate(() => window.obsController.isConnected), "partial status preserves connection");
  await state("Interview", false);
  check(await page.locator(".scene-preview-card:disabled").count() === names.length, "disconnect disables switching");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelectorAll("#scenePreviewGrid iframe").length === 0);

  // Fallback to the default scenes when the template cannot be loaded; retried on open.
  templateUp = false;
  await page.goto(commentator());
  await page.waitForFunction(() => !!window.scenePicker && !!window.cursorLabel);
  await page.locator("#openScenes").click();
  await page.waitForFunction(() => document.getElementById("scenePickerStatus").textContent.includes("Using default scenes"));
  check(JSON.stringify(await cardNames()) === JSON.stringify(["Main", "Intro", "Hosts", "Interview", "Break", "Goodbye"]), "default scenes on failure");
  await page.waitForFunction(() => document.querySelector(".scene-preview-card iframe")?.getAttribute("src") === "https://app.baduk.club/stream-overlay/3");
  await page.keyboard.press("Escape");
  templateUp = true;
  const before = templateRequests;
  await page.locator("#openScenes").click();
  await page.waitForFunction(() => document.querySelectorAll(".scene-preview-card").length === 5);
  check(templateRequests > before, "template retried when dialog opens");
  check(!(await page.locator("#scenePickerStatus").textContent()).includes("Using default scenes"), "fallback note cleared after reload");
  await page.keyboard.press("Escape");

  // No origin at all: defaults, no request, no errors.
  const requestsBefore = templateRequests;
  await page.goto(`${base}?${new URLSearchParams({ role: "CO", label: "Preview", Network: "preview", obs: "https://vdo.ninja/?room=preview" })}`);
  await page.waitForFunction(() => !!window.scenePicker && !!window.cursorLabel);
  await page.locator("#openScenes").click();
  await page.waitForFunction(() => document.getElementById("scenePickerStatus").textContent.includes("Using default scenes"));
  check(await page.locator(".scene-preview-card").count() === 6 && templateRequests === requestsBefore, "no origin uses defaults");
  await page.keyboard.press("Escape");
  // Without a Badukcast server the button still drives OBS directly.
  const plainRelay = await obsFrame();
  await plainRelay.evaluate(() => parent.postMessage({ action: "obs-state", UUID: "plain-obs", value: { details: { controlLevel: 5, scenes: ["Main"], currentScene: { name: "Main" } } } }, "*"));
  await page.waitForFunction(() => !document.getElementById("obsStreamToggle").disabled);
  const callsBefore = streamCalls.length;
  await page.evaluate(() => document.getElementById("obsStreamToggle").click());
  await plainRelay.waitForFunction(() => commands.some((command) => command.obsCommand.action === "startStreaming"));
  check(await plainRelay.evaluate(() => commands.find((command) => command.obsCommand.action === "startStreaming").UUID) === "plain-obs", "direct start addressed to the OBS that reported");
  check(streamCalls.length === callsBefore, "no server call without a Badukcast server");

  // Shared links keep the mini-PC ID but no longer carry per-scene settings.
  await page.goto(`${base}?aiOrigin=${encodeURIComponent(ORCHA)}`);
  await page.waitForFunction(() => !!window.scenePicker);
  check(await page.locator("#sceneConfigRows").count() === 0, "per-scene settings removed");
  await page.locator(".landing-advanced summary").click();
  await page.locator("#sceneMiniPc").fill("7");
  await page.getByRole("button", { name: "Apply settings", exact: true }).click();
  const shared = new URL(await page.locator(".host-link").first().getAttribute("data-url"));
  check(shared.searchParams.get("miniPc") === "7", "shared mini PC");
  const stale = [...shared.searchParams.keys()].filter((key) => /^scene(Main|Intro|Hosts|Interview)(Url|Name|Enabled)$/.test(key));
  check(stale.length === 0, `old scene params gone: ${stale}`);
  shared.searchParams.set("label", "Test");
  shared.searchParams.set("sceneMainUrl", "https://evil.test/{pc}");
  await page.goto(shared.href);
  await page.waitForFunction(() => !!window.scenePicker && !!window.cursorLabel);
  await page.locator("#openScenes").click();
  await page.waitForFunction(() => document.querySelector(".scene-preview-card iframe")?.getAttribute("src") === "https://app.baduk.club/stream-overlay/7");
  check(errors.length === 0, errors.join("\n"));
  console.log("PASS: template-driven cards (incl. custom 5th scene), relay commands, Live confirmation, composite previews with {pc}, preview cleanup, default fallback and retry, mini-PC shared link without old scene params");
} finally {
  await browser?.close();
  await server.shutdown();
}
