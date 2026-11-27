// Run: deno run -A --no-lock tests/tournament-loader.mjs
// Commentary-code join: one code boots the commentator view with the
// tournament's room, OBS, chat, camera feed and AI analysis already loaded.
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
const ORCHA = "https://test.badukcast.example";
let browser;
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") || "/home/sensui/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.addr.port}/`;
  let status = 200;
  let requests = 0;
  const games = [
    { id: "one", name: "Board 1", blackPlayer: "Alice", whitePlayer: "Bob", roundNumber: 1, boardNumber: 1, status: "finished", vdoUrl: "https://vdo.ninja/?view=one", analysisContext: { type: "game", id: "1111" } },
    { id: "two", name: "Board 2", blackPlayer: "Cara", whitePlayer: "Dan", roundNumber: 2, boardNumber: 1, status: "active", vdoUrl: "https://vdo.ninja/?view=two", analysisContext: { type: "game", id: "2222" } },
  ];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORCHA) {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "X-BadukCast-Key" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (url.pathname === "/api/v1/bootstrap") {
        requests++;
        check(request.headers()["x-badukcast-key"] === "ABCDEFGH", "normalized key sent in header");
        check(!url.href.includes("ABCDEFGH"), "key excluded from request URL");
        return route.fulfill({
          status, headers: cors, contentType: "application/json",
          body: JSON.stringify({
            tournament: { id: "san-diego", name: "San Diego" },
            games,
            overlaySettings: { networkRoom: "san-diego-room", obsVdoUrl: "https://vdo.ninja/?room=control", chatUrl: "https://example.com/chat" },
          }),
        });
      }
      return route.fulfill({ status: 404, headers: cors, body: "{}" });
    }
    if (url.origin === new URL(base).origin) return route.continue();
    return route.fulfill({ contentType: "text/html", body: "" });
  });
  await page.goto(base);
  await page.waitForFunction(() => !!window.enterCommentatorMode && !!window.networkManager);
  check(await page.locator("#landing").isVisible(), "landing shown first");
  await page.getByText("Server settings", { exact: true }).click();
  check(await page.locator("#BadukCastServer").inputValue() === `http://127.0.0.1:8080`, "locally served page defaults to the local Orcha");
  await page.locator("#BadukCastServer").fill(ORCHA);
  const join = async (code) => {
    await page.locator("#CommentaryCode").fill(code);
    await page.locator("#loadTournament").click();
    await page.waitForFunction(() => !document.getElementById("loadTournament").disabled);
  };

  // Errors keep the commentator on the landing page.
  await join("short");
  check(requests === 0, "short code rejected before any request");
  check((await page.locator("#tournamentLoadStatus").textContent()).includes("eight-character"), "short code guidance");
  status = 401;
  await join("abcdefgh");
  check((await page.locator("#tournamentLoadStatus").textContent()).includes("invalid"), "401 message");
  check(await page.locator("#landing").isVisible(), "still on landing after error");
  await page.locator("#BadukCastServer").fill(base);
  const beforeSelf = requests;
  await join("abcdefgh");
  check(requests === beforeSelf, "own page address rejected before request");
  check((await page.locator("#tournamentLoadStatus").textContent()).includes("not the Badukcast server"), "explains OverlayTool vs server address");
  await page.locator("#BadukCastServer").fill("https://user:pw@example.com");
  const beforeBad = requests;
  await join("abcdefgh");
  check(requests === beforeBad, "credential-bearing server rejected before request");
  await page.locator("#BadukCastServer").fill(ORCHA);

  // A valid code boots the commentator view directly.
  status = 200;
  await page.locator("#CommentatorName").fill("Commentator One");
  await join(" abcdefgh ");
  await page.waitForFunction(() => window.appMode === "commentator");
  check(await page.locator("#app").isVisible(), "commentator view shown");
  check(!(await page.locator("#landing").isVisible()), "landing hidden");
  const url = new URL(page.url());
  check(url.searchParams.get("role") === "CO", "URL switched to commentator role");
  check(await page.evaluate(() => history.length) >= 2, "commentator link is a new history entry");
  check(url.searchParams.get("label") === "Commentator One", "name carried into commentator view");
  check(url.searchParams.get("Network") === "san-diego-room", "network room from tournament");
  check(url.searchParams.get("aiOrigin") === ORCHA, "AI served by the tournament server");
  check(url.searchParams.get("ai") === "game/2222", "AI analysis for the active game");
  check(!page.url().includes("ABCDEFGH"), "code not in URL");
  check((await page.locator("#feed").getAttribute("src") || "").includes("view=two"), "camera feed for the active game");
  check((await page.locator("#chat").getAttribute("src") || "").startsWith("https://example.com/chat"), "chat loaded");
  check(await page.locator("#AiOverlayHeader").inputValue() === "game/2222", "AI panel context set");
  check(await page.evaluate(() => window.tournamentAccessKey) === "ABCDEFGH", "code kept in memory for timer/AI");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  check(!stored.includes("ABCDEFGH"), "code not saved in browser storage");

  // Game switcher in the commentator header.
  check(await page.locator("#TournamentGame").isVisible(), "game switcher shown for multi-game tournaments");
  check(await page.locator("#TournamentGame").inputValue() === "two", "active game preselected");
  await page.locator("#TournamentGame").selectOption("one");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ai") === "game/1111");
  check((await page.locator("#feed").getAttribute("src") || "").includes("view=one"), "switching game swaps the feed");
  check(await page.locator("#AiOverlayHeader").inputValue() === "game/1111", "switching game swaps the AI analysis");

  // Name prompt is skipped because the name was given on the join form.
  check(!(await page.locator("dialog[open]").count()), "no extra dialogs after joining");
  check(errors.length === 0, `page errors: ${errors.join("; ")}`);
  console.log("Commentary-code join checks passed: errors stay on landing, one code boots the commentator view with room, OBS, chat, feed and AI for the active game, game switching, and code privacy.");
} finally {
  await browser?.close();
  await server.shutdown();
}
