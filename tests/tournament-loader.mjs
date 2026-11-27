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
  let networkRoom = "san-diego-room";
  const seatCalls = [];
  let seatsFull = false;
  let nextSeat = 1;
  const games = [
    { id: "one", name: "Board 1", blackPlayer: "Alice", whitePlayer: "Bob", roundNumber: 1, boardNumber: 1, status: "finished", vdoUrl: "https://vdo.ninja/?view=one", analysisContext: { type: "game", id: "1111" } },
    { id: "two", name: "Board 2", blackPlayer: "Cara", whitePlayer: "Dan", roundNumber: 2, boardNumber: 1, status: "active", vdoUrl: "https://vdo.ninja/?view=two", analysisContext: { type: "game", id: "2222" } },
  ];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORCHA) {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "X-BadukCast-Key, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      // Host seats: Badukcast hands out Host 1 / Host 2 and refuses a third.
      const host = /^\/stream\/PC(\d+)\/host(\/release)?$/.exec(url.pathname);
      if (host) {
        const body = JSON.parse(request.postData() || "{}");
        seatCalls.push({ pc: host[1], release: !!host[2], name: body.name, session: body.session, key: request.headers()["x-badukcast-key"] });
        if (host[2]) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ hosts: [] }) });
        return seatsFull
          ? route.fulfill({ status: 409, headers: cors, contentType: "application/json", body: JSON.stringify({ error: "hosts_full", hosts: [{ seat: 1, name: "Devin" }, { seat: 2, name: "Jae" }] }) })
          : route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ pc: Number(host[1]), seat: nextSeat, hosts: [{ seat: nextSeat, name: body.name }] }) });
      }
      if (url.pathname === "/api/v1/bootstrap") {
        requests++;
        // Badukcast ignores letter case; the key is sent as typed, in a header only.
        const sent = (request.headers()["x-badukcast-key"] || "").toUpperCase();
        check(["ABCDEFGH", "STATEGOOPEN2026"].includes(sent), `key sent in header: ${sent}`);
        check(!/abcdefgh|stategoopen2026/i.test(url.href), "key excluded from request URL");
        return route.fulfill({
          status, headers: cors, contentType: "application/json",
          body: JSON.stringify({
            tournament: { id: "san-diego", name: "San Diego" },
            games,
            overlaySettings: { networkRoom, obsVdoUrl: "https://vdo.ninja/?room=control", chatUrl: "https://example.com/chat" },
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
  await join("ab");
  check(requests === 0, "too-short key rejected before any request");
  await join("has spaces");
  check(requests === 0, "key with spaces rejected before any request");
  check((await page.locator("#tournamentLoadStatus").textContent()).includes("without spaces"), "key guidance");
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
  check(!/abcdefgh/i.test(page.url()), "code not in URL");
  check((await page.locator("#feed").getAttribute("src") || "").includes("view=two"), "camera feed for the active game");
  check((await page.locator("#chat").getAttribute("src") || "").startsWith("https://example.com/chat"), "chat loaded");
  check(await page.locator("#AiOverlayHeader").inputValue() === "game/2222", "AI panel context set");
  check((await page.evaluate(() => window.tournamentAccessKey)).toUpperCase() === "ABCDEFGH", "code kept in memory for timer/AI");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  check(!/abcdefgh/i.test(stored), "code not saved in browser storage");

  // Game switcher in the commentator header.
  check(await page.locator("#TournamentGame").isVisible(), "game switcher shown for multi-game tournaments");
  check(await page.locator("#TournamentGame").inputValue() === "two", "active game preselected");
  await page.locator("#TournamentGame").selectOption("one");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ai") === "game/1111");
  check((await page.locator("#feed").getAttribute("src") || "").includes("view=one"), "switching game swaps the feed");
  check(await page.locator("#AiOverlayHeader").inputValue() === "game/1111", "switching game swaps the AI analysis");

  // Name prompt is skipped because the name was given on the join form.
  check(!(await page.locator("dialog[open]").count()), "no extra dialogs after joining");

  // The first join above took a host seat from Badukcast.
  check(seatCalls.length >= 1 && seatCalls[0].pc === "3" && seatCalls[0].name === "Commentator One" && !seatCalls[0].release, `seat claimed on join: ${JSON.stringify(seatCalls[0])}`);
  check(/^[A-Za-z0-9-]{8,64}$/.test(seatCalls[0].session || ""), "seat claim carries a tab session id");
  check(new URL(page.url()).searchParams.get("host") === "1", "joined as Host 1");

  // Both seats taken: a third commentator is told who holds them and stays out.
  seatsFull = true;
  await page.goto("about:blank");
  await page.goto(`${base}?key=StateGoOpen2026&name=Third&server=${encodeURIComponent(ORCHA)}`);
  await page.waitForFunction(() => document.getElementById("tournamentLoadStatus")?.textContent.includes("Both host seats are taken"));
  check((await page.locator("#tournamentLoadStatus").textContent()).includes("Devin and Jae"), "names who holds the seats");
  check(await page.evaluate(() => window.appMode) === "landing" && await page.locator("#landing").isVisible(), "refused commentator stays on the start page");
  check(await page.locator("#CommentaryCode").inputValue() === "StateGoOpen2026", "key kept in the form to retry");
  check(!(await page.evaluate(() => window.tournamentAccessKey)), "refused commentator holds no key");
  // A seat frees up: pressing Join again gets in, as Host 2.
  seatsFull = false;
  nextSeat = 2;
  await page.locator("#loadTournament").click();
  await page.waitForFunction(() => window.appMode === "commentator");
  check(new URL(page.url()).searchParams.get("host") === "2", "joined as Host 2 once a seat is free");
  nextSeat = 1;
  await page.goto("about:blank");

  // Organiser's join link: ?key=…&name=… The key is stripped from the address
  // bar at once and everything else is loaded from Badukcast.
  networkRoom = "OverlayTool7";
  const joinLink = (name) => `${base}?key=StateGoOpen2026&name=${encodeURIComponent(name)}&server=${encodeURIComponent(ORCHA)}`;
  const beforeLink = requests;
  await page.goto(joinLink("Devin"));
  await page.waitForFunction(() => window.appMode === "commentator");
  check(requests === beforeLink + 1, "join link loads the tournament without typing the code");
  const linked = new URL(page.url());
  check(!linked.searchParams.has("key") && !/stategoopen2026/i.test(page.url()), `key removed from the address bar: ${page.url()}`);
  check(linked.searchParams.get("Network") === "OverlayTool7", "network room from Badukcast, not from the link");
  check(linked.searchParams.get("miniPc") === "7", "mini-PC follows the OverlayTool{pc} network room");
  check(linked.searchParams.get("label") === "Devin", "name from the link");
  check((await page.locator("#obs").getAttribute("src") || "").startsWith("https://vdo.ninja/?room=control"), "OBS control link loaded");
  check(await page.evaluate(() => window.tournamentAccessKey) === "StateGoOpen2026", "tournament-name key kept in memory after link join");
  check(!/stategoopen2026/i.test(await page.evaluate(() => window.currentViewerUrl || "")), "key not in the viewer link");

  // `name=` left empty (and none remembered): the link only prefills.
  await page.evaluate(() => localStorage.clear());
  const beforeNameless = requests;
  await page.goto("about:blank");
  await page.goto(joinLink(""));
  await page.waitForFunction(() => document.getElementById("tournamentLoadStatus")?.textContent.includes("Enter your name"));
  check(requests === beforeNameless, "no request until the commentator gives a name");
  check(!new URL(page.url()).searchParams.has("key"), "key removed from the address bar while waiting");
  check(await page.locator("#CommentaryCode").inputValue() === "StateGoOpen2026", "key prefilled");
  check(await page.locator("#BadukCastServer").inputValue() === ORCHA, "server prefilled");
  await page.locator("#CommentatorName").fill("Commentator Two");
  await page.locator("#loadTournament").click();
  await page.waitForFunction(() => window.appMode === "commentator");
  check(new URL(page.url()).searchParams.get("label") === "Commentator Two", "joined after naming");

  check(errors.length === 0, `page errors: ${errors.join("; ")}`);
  console.log("Commentary-code join checks passed: errors stay on landing, one code boots the commentator view with room, OBS, chat, feed and AI for the active game, game switching, and code privacy.");
} finally {
  await browser?.close();
  await server.shutdown();
}
