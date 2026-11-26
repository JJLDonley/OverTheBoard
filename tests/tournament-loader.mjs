// Run: deno run -A tests/tournament-loader.mjs
// Starts an isolated local server unless OVERLAY_TEST_URL is supplied.
import { chromium } from "npm:playwright@1.63.0";
const root = new URL("../", import.meta.url);
const server = Deno.env.get("OVERLAY_TEST_URL") ? null : Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen() {} },
  async (request) => {
    const pathname = new URL(request.url).pathname;
    const file = new URL(
      `.${pathname === "/" ? "/index.html" : pathname}`,
      root,
    );
    if (!file.href.startsWith(root.href)) {
      return new Response("Not found", {
        status: 404,
      });
    }
    try {
      const type = {
        html: "text/html",
        js: "text/javascript",
        css: "text/css",
        png: "image/png",
      }[file.pathname.split(".").pop()] || "application/octet-stream";
      return new Response(await Deno.readFile(file), {
        headers: { "Content-Type": type },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
);
let browser;
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") ||
      "/home/sensui/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = new URL(
    Deno.env.get("OVERLAY_TEST_URL") || `http://127.0.0.1:${server.addr.port}/`,
  );
  let responseStatus = 200;
  let malformedResponse = false;
  let networkFailure = false;
  let tournament = { id: "san-diego", name: "San Diego" };
  let overlaySettings = {
    networkRoom: "san-diego-room",
    obsVdoUrl: "https://vdo.ninja/?room=control",
    chatUrl: "https://example.com/chat",
  };
  let requests = 0;
  let games = [
    {
      id: "one",
      name: "Board 1",
      blackPlayer: "Alice",
      whitePlayer: "Bob",
      roundNumber: 1,
      boardNumber: 1,
      status: "active",
      vdoUrl: "https://vdo.ninja/?view=one",
      analysisContext: { type: "game", id: "1234" },
    },
    {
      id: "two",
      name: "Board 2",
      status: "ready",
      vdoUrl: "https://vdo.ninja/?view=two",
      analysisContext: { type: "review", id: "5678" },
    },
  ];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/bootstrap") {
      requests++;
      check(
        route.request().headers()["x-badukcast-key"] === "ABCDEFGH",
        "normalized key sent in header",
      );
      check(!url.href.includes("ABCDEFGH"), "key excluded from request URL");
      if (networkFailure) return route.abort("failed");
      return route.fulfill({
        status: responseStatus,
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/json",
        body: JSON.stringify({
          tournament: malformedResponse ? null : tournament,
          games,
          overlaySettings,
        }),
      });
    }
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "X-BadukCast-Key",
        },
      });
    }
    if (url.origin === base.origin) return route.continue();
    return route.fulfill({ contentType: "text/html", body: "" });
  });
  await page.goto(base.href);
  await page.waitForFunction(() =>
    !!window.generateViewerUrl && !!window.networkManager
  );
  await page.getByText("Server settings", { exact: true }).click();
  await page.locator("#BadukCastServer").fill("https://test.badukcast.example");
  const load = async () => {
    await page.locator("#CommentaryCode").fill(" abcdefgh ");
    await page.locator("#loadTournament").click();
    await page.waitForFunction(() =>
      !document.getElementById("loadTournament").disabled
    );
  };
  await load();
  check(
    (await page.locator("#tournamentLoadStatus").textContent()).includes(
      "San Diego loaded",
    ),
    "tournament loaded",
  );
  check(
    await page.locator("#NetworkRoom").inputValue() === "san-diego-room",
    "room filled",
  );
  check(
    await page.locator("#ChatUrl").inputValue() === "https://example.com/chat",
    "chat filled",
  );
  check(
    await page.locator("#ObsVdoUrl").inputValue() ===
      "https://vdo.ninja/?room=control",
    "controller filled",
  );
  check(
    await page.locator("#VideoURL").inputValue() === "",
    "multiple games require selection",
  );
  await page.locator("#TournamentGame").selectOption("one");
  check(
    await page.locator("#VideoURL").inputValue() ===
      "https://vdo.ninja/?view=one",
    "selected camera filled",
  );
  check(
    await page.locator("#AiOverlay").inputValue() === "game/1234",
    "selected analysis filled",
  );
  await page.locator("#TournamentGame").selectOption("two");
  check(
    await page.locator("#AiOverlay").inputValue() === "review/5678",
    "game switching updates analysis",
  );
  const viewerUrl = await page.locator("#viewerUrlOutput").inputValue();
  check(
    !viewerUrl.includes("ABCDEFGH") &&
      !viewerUrl.toLowerCase().includes("abcdefgh"),
    "key excluded from shared URL",
  );
  check(
    new URL(viewerUrl).searchParams.get("aiOrigin") ===
      "https://test.badukcast.example",
    "analysis uses selected server in generated links",
  );
  check(
    await page.locator("#CommentaryCode").inputValue() === "",
    "key cleared after loading",
  );
  responseStatus = 401;
  await load();
  check(
    (await page.locator("#tournamentLoadStatus").textContent()).includes(
      "invalid",
    ),
    "invalid key explained",
  );
  check(
    await page.locator("#AiOverlay").inputValue() === "review/5678",
    "failed request preserves session",
  );
  responseStatus = 200;
  games = [games[0]];
  await load();
  check(
    await page.locator("#AiOverlay").inputValue() === "game/1234",
    "single game fills automatically",
  );
  check(requests === 3, "one request per submission");
  check(
    await page.locator("#AiOverlayHeader").inputValue() === "game/1234",
    "AI header stays synchronized",
  );
  check(
    await page.locator("#feed").getAttribute("src")?.then((value) =>
      value.includes("view=one")
    ),
    "camera iframe updated",
  );
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })
  );
  check(
    !storage.toLowerCase().includes("abcdefgh"),
    "code excluded from browser storage",
  );

  // A second tournament with no configured links must clear the first one.
  tournament = { id: "california", name: "California Championship" };
  overlaySettings = {};
  games = [];
  await load();
  check(
    await page.locator("#NetworkRoom").inputValue() === "badukcast-california",
    "new tournament gets its own fallback room",
  );
  for (
    const id of [
      "VideoURL",
      "AiOverlay",
      "AiOverlayHeader",
      "ObsVdoUrl",
      "ChatUrl",
    ]
  ) {
    check(
      await page.locator(`#${id}`).inputValue() === "",
      `${id} clears when tournament has no details`,
    );
  }
  for (const id of ["feed", "obs", "chat"]) {
    check(
      await page.locator(`#${id}`).getAttribute("src") === null,
      `${id} stops showing old tournament`,
    );
  }
  check(
    await page.locator("#TournamentGame").isDisabled(),
    "no-game tournament disables selection",
  );
  check(
    await page.locator("#TournamentGame option").count() === 1,
    "old games removed",
  );
  const missingStatus = await page.locator("#tournamentLoadStatus")
    .textContent();
  check(
    missingStatus.includes("No games") &&
      missingStatus.includes("not configured"),
    "missing game and link guidance shown",
  );
  const cleanViewer = new URL(
    await page.locator("#viewerUrlOutput").inputValue(),
  );
  for (const parameter of ["OTB", "ai", "obs", "Chat"]) {
    check(
      !cleanViewer.searchParams.has(parameter),
      `${parameter} removed from generated links`,
    );
  }

  // Reload a usable session before exercising failures that must preserve it.
  games = [{
    id: "ca-board",
    name: "California board",
    status: "ready",
    vdoUrl: "https://vdo.ninja/?view=ca",
    analysisContext: { type: "game", id: "9999" },
  }];
  await load();
  for (
    const [status, expected] of [[403, "does not allow"], [404, "not found"], [
      429,
      "Too many",
    ], [503, "unavailable"]]
  ) {
    responseStatus = status;
    await load();
    check(
      (await page.locator("#tournamentLoadStatus").textContent()).includes(
        expected,
      ),
      `${status} gives actionable error`,
    );
    check(
      await page.locator("#AiOverlay").inputValue() === "game/9999",
      `${status} preserves previous session`,
    );
    check(
      await page.locator("#TournamentGame").isEnabled(),
      `${status} restores game selector`,
    );
  }
  responseStatus = 200;
  malformedResponse = true;
  await load();
  check(
    (await page.locator("#tournamentLoadStatus").textContent()).includes(
      "incomplete",
    ),
    "malformed response explained",
  );
  check(
    await page.locator("#VideoURL").inputValue() ===
      "https://vdo.ninja/?view=ca",
    "malformed response preserves previous feed",
  );
  malformedResponse = false;
  networkFailure = true;
  await load();
  check(
    (await page.locator("#tournamentLoadStatus").textContent()).includes(
      "Could not reach",
    ),
    "network failure explained",
  );
  check(
    await page.locator("#AiOverlay").inputValue() === "game/9999",
    "network failure preserves analysis",
  );
  networkFailure = false;

  const beforeInvalidCode = requests;
  await page.locator("#CommentaryCode").fill("short");
  await page.locator("#loadTournament").click();
  await page.waitForFunction(() =>
    !document.getElementById("loadTournament").disabled
  );
  check(
    requests === beforeInvalidCode,
    "short code rejected before network request",
  );
  check(
    (await page.locator("#tournamentLoadStatus").textContent()).includes(
      "eight-character",
    ),
    "short code guidance",
  );
  await page.locator("#BadukCastServer").fill(
    "https://user:password@example.com",
  );
  await load();
  check(
    requests === beforeInvalidCode,
    "credential-bearing server rejected before request",
  );
  check(errors.length === 0, errors.join("\n"));
  console.log(
    "Commentary-code browser checks passed: form filling, tournament switching, missing settings, errors, and code privacy.",
  );
} finally {
  await browser?.close();
  await server?.shutdown();
}
