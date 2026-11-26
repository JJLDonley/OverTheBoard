# Board-Overlay

A modern, web-based board review and broadcast overlay tool with integrated video, chat, and OBS WebSocket controls.

## Completed broadcast work

Completed work across BadukCast and OverlayTool, including earlier merged fixes:

```text
Clock:
* Fixed standalone clock overlays binding to VDO sessions
* Fixed countdown recovery after stale readings
* Preserved OCR clocks across review moves
* Added frame-position rotation workaround; remaining rotation bugs still need checking

Dashboard / OBS:
* Fixed OBS source saving
* Added support for a local OBS launcher

Video:
* Fixed memory growth during video-frame processing

OGS / Games:
* Fixed pass-move parsing and OGS analysis parsing
* Added ephemeral URL games to Dashboard event handling
* Fixed canonical AI history and history backfilling

Frontend / AI:
* Fixed game-state recovery after updates and server restarts
* Added automatic recovery for stalled WebSockets
* Added connection timeouts and automatic resubscription
* Fixed analysis not resuming after reconnect
* Automatically requests the current position again
* Clears lost pending requests and handles failed sends

URLs:
* Fixed view= and room= preservation and encoded parameter handling
* Documented room-scoped VDO URLs

Overlay:
* Fixed drawing, annotation, and shared-cursor colors
* Added tool-name and keybinding tooltips
* Replaced tool icons
* Fixed viewport overflow and board clipping
* Added compact AI modal with draggable pinned panels
* Fixed keyboard shortcuts interfering with typing and browser controls

Chat:
* Added highlighted messages over the board feed
* Added a dismiss X beside highlighted messages
* Added “Click Message To Highlight”
* Hid chat tools from the embed
* Added configurable chat session IDs

Scenes:
* Added Tenjin preview modal
* Enabled Main, Intro, Hosts, and Interview previews
* Added click-to-switch OBS scene selection
* Added confirmed Live indicators and preview tooltips
* Added Advanced Settings and shared URLs for Tenjin pages
```

Clock, Dashboard/OBS, Video, OGS/Games, Frontend/AI recovery, and VDO URL fixes
belong to BadukCast. OverlayTool owns the Overlay, Chat, and Tenjin Scenes work.
Scene switching has been tested with a simulated OBS relay. Real Dashboard OBS
and dual-stream testing, host-controlled intro countdown, and live usability
feedback remain outstanding. Preview availability depends on the Tenjin pages.

### Scene regression check

With this repository served locally (default test URL `http://127.0.0.1:8765/`):

```sh
deno run -A tests/scene-picker.mjs
```

Set `OVERLAY_TEST_URL` to use another local server. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` if Chromium is installed outside Playwright's
usual location. The test mocks external frames and the OBS relay and checks
scene commands, confirmation, disconnect handling, and shared settings.

## Features

### Real Board Feed
- **URL Link**: Add your board video feed URL (usually requires embed)
- **Audio Control**: URL is intentionally left open. You will need to add a way to mute this
- **Recommendation**: Highly recommend VDO Ninja with `&noaudio` parameter
- **Alternative**: You can also mute the tab this page is on
- **Purpose**: Shows where the overhead board will go and allows review with canvas overlay

### Stone Size
- **Purpose**: Allows matching as best as possible between board and overlay
- **Function**: Interpolated between the grid points but can be set manually
- **Usage**: Adjust the stone size to match your physical board stones

### Chat Integration
- **Requirement**: Chat URL requires embedding or URL that allows iframe embedding
- **Purpose**: Provides chat overlay for viewer interaction
- **Examples**: Twitch, YouTube, Discord, or custom chat systems

### OBS Camera
- **Purpose**: Provides an easy Face + UI layout for commentators
- **Location**: Appears in the side panel
- **Features**: Camera feed with commentator controls

### Side Panel
- **Behavior**: Shows if either Camera or Chat is available, otherwise hides automatically
- **Layout**: Adjusts dynamically based on available content

### OBS WebSocket Control
- **Purpose**: Allows users to control their OBS remotely
- **Setup**: You will likely need to forward an address to the local server of OBS
- **Local Usage**: If you want to use this locally, grab your OBS WebSocket Server URL and plug it in
- **Scenes**: Can be left empty if you want full control, or add specific scenes that you want available to the user/commentator

## Review Tools

### Stone Placement
- **Black Stone**: Place black stones on the board
- **White Stone**: Place white stones on the board
- **Erase**: Remove stones by clicking on them

### Drawing Tools
- **Drawing**: Free-hand drawing with customizable colors
- **Eraser**: Erase drawings and marks
- **Space**: Clear all stones, drawings, and markers

### Markers and Symbols
- **Triangle**: Place triangle markers
- **Circle**: Place circle markers  
- **Square**: Place square markers
- **Letters**: Place letters (A-Z) on the board

### Grid and Coordinates
- **Show Grid**: Toggle grid visibility
- **Show Coordinates**: Toggle coordinate labels (A-T, 1-19)

## OBS Controls

### Connection Status
- **Connected**: Green indicator when successfully connected to OBS
- **Disconnected**: Red indicator when not connected
- **Connecting**: Yellow indicator during connection attempt

### Scene Management
- **Scenes** opens a modal with Tenjin previews; selecting a configured preview requests its matching OBS scene.
- **Preview settings** sets the mini-PC ID (default `3`), Tenjin URL/path, exact OBS scene name, and enabled state for each card. `{pc}` is replaced with the mini-PC ID.
- OBS scene names default to `Main`, `Intro`, `Hosts`, and `Interview`. Custom saved names are preserved; names can be changed in Preview settings.
- All four previews are enabled by default: `/stream-overlay/{pc}`, `/intro/{pc}`, `/hosts/{pc}`, and `/interview/{pc}`. Older placeholder settings are automatically enabled.
- Configure Tenjin scenes under **Session Setup > Advanced**, then click **Apply settings** to update generated links. The same settings are available inside the Scenes modal.
- Shared links include `miniPc` and `sceneMainUrl`, `sceneMainName`, `sceneMainEnabled` (also `Intro`, `Hosts`, and `Interview`). Enabled is `1` or `0`; URLs support `{pc}`. URL parameters override browser settings. Values are encoded automatically when generating links.
- Scene switching is disabled while disconnected or waiting for confirmation. The active highlight reflects OBS-confirmed state.
- Previews load only while the modal is open and come from Tenjin, not OBS captures.

### Stream Control
- **Toggle Button**: Single button that shows "Start Stream" or "Stop Stream"
- **Transition States**: Shows "Starting..." or "Stopping..." during transitions
- **Status Updates**: Real-time updates of streaming status

## URL Parameters

### Basic Parameters
- `OTB`: Main board video URL (double-encoded). Required for viewers.
- `Chat`: Chat embed URL
- `obs`: OBS controller VDO Ninja URL (double-encoded)
- `Network`: VDO Ninja room name
- `stone`: Stone size value
- `role`: `CO` (commentator) or `VW` (viewer)
- `ai`: AI overlay context as `type/id`, e.g. `game/87480675`
- `db`: Use local AI host (`http://localhost:8080`) instead of `https://stream-ai.baduk.club`

### Tenjin Scene Parameters

| Scene | Preview URL parameter | OBS scene name parameter | Enabled parameter |
|---|---|---|---|
| Main | `sceneMainUrl` | `sceneMainName` | `sceneMainEnabled` |
| Intro | `sceneIntroUrl` | `sceneIntroName` | `sceneIntroEnabled` |
| Hosts | `sceneHostsUrl` | `sceneHostsName` | `sceneHostsEnabled` |
| Interview | `sceneInterviewUrl` | `sceneInterviewName` | `sceneInterviewEnabled` |

- `miniPc` sets the positive numeric mini-PC ID (default `3`).
- Preview values accept a path such as `/intro/{pc}` or a full HTTPS URL on `app.baduk.club`. `{pc}` is replaced with the mini-PC ID.
- OBS scene names must match exactly. Defaults are `Main`, `Intro`, `Hosts`, and `Interview`.
- Enabled values are `1` (on) and `0` (off). All four scenes are enabled by default.
- URL parameters override saved browser settings. Omitted parameters use saved settings or defaults.

To configure and share:

1. Open **Session Setup → Advanced → Tenjin scenes**.
2. Enter the mini-PC ID, preview URLs, matching OBS scene names, and enabled states. Enter normal, unencoded values in these fields.
3. Click **Apply settings**, then copy a generated host link. All scene settings are included and URL-encoded automatically.

For manual editing, append this example to an existing commentator URL that already has a query string:

```text
&miniPc=3&sceneIntroUrl=%2Fintro%2F%7Bpc%7D&sceneIntroName=Intro&sceneIntroEnabled=1
```

This loads `/intro/3` and maps it to the OBS scene `Intro`. Use `?` instead of the first `&` when starting a new query string. Encode each parameter value once.

Clicking a preview requests its mapped scene when OBS is connected. The Live indicator changes after OBS confirms the switch.

### AI Overlay
Commentators can enter an AI context in setup, or pass it in the URL:

```txt
?ai=game/87480675
?ai=review/123456
?ai=game/87480675&db
```

OverlayTool embeds individual analysis views, for example the winrate panel:

```txt
https://stream-ai.baduk.club/type/id?e=b,w,bar&width=320
```

With `?db`, it embeds the local AI page instead:

```txt
http://localhost:8080/type/id?e=b,w,bar&width=320
```

Open **AI** in the top bar to configure a game/review and select analysis views. Each view has a **pin icon**: when the AI window closes, selected views remain draggable over the board. Toggle the pin off to return a view to the AI window. Pins and positions last for the current page session.

### OBS Remote Control (via VDO Ninja)
- **How it works**: The OBS control panel is an embedded VDO Ninja iframe that relays OBS WebSocket controls through VDO Ninja. No direct browser-to-OBS WebSocket connection is required.
- **Scenes**: Open the Tenjin preview modal and click a preview to request its mapped OBS scene through VDO Ninja.

### Grid Parameters
- `grid`: Grid corner coordinates (semicolon-separated)
### Coordinate Color
- `CC`: Coordinate label color (hex)

## Usage Examples

### Complete Setup URL
```
https://yoursite.com/?OTB=your-video-url&Chat=your-chat-url&obs=your-vdo-ninja-obs-url&Network=your-room&stone=125&role=CO
```

## Technical Notes

### OBS WebSocket Compatibility
- Supports OBS WebSocket v5.x
- Automatic authentication handling
- Fallback methods for different OBS versions
- Real-time event handling

### Browser Compatibility
- Modern browsers with WebSocket support
- HTTPS required for secure WebSocket connections
- Camera and microphone permissions for OBS feed

### Security Considerations
- OBS WebSocket passwords are not included in shareable URLs
- Passwords must be entered manually for security
- Scene lists are included in URLs for convenience

## Link
[Board-Overlay Tool](https://weiqipro.github.io/Board-Overlay/)

### Featured chat on the board feed

Commentators see compact highlighted Social Stream messages over the board feed. Reading time is 250 ms per word (four words per second), with a one-second minimum and a short entrance-animation allowance. A read-only connection to the Social Stream featured-message channel supplies the word count; if that connection is unavailable, the popup uses a two-second fallback. The overlay does not intercept board drawing or clicks and is not loaded in viewer mode. The chat panel displays "Click Message To Highlight" above the chat.

The featured overlay uses the session in a Social Stream `Chat` URL, or defaults to `zyab4FcJGh`. Set `chatSession=YOUR_SESSION` in the commentator URL to override both the featured overlay and a Social Stream sidebar chat. This setting is preserved in generated commentator links; other chat providers are unchanged. Full simultaneous-stream session management is deferred.

A circular close button appears beside the lower-left highlighted popup. It dismisses only the local commentator overlay and returns focus to the board. Later highlights appear normally; dismissal does not clear the broadcast highlight or affect other commentators.

AI views use BadukCast element parameters: board (`board`), winrate (`e=b,w,bar`), territory (`t=bp,bi,wp,wi,bar`), area (`a=b,w,u,bar`), players (`p=b,w`), pie (`pie`), move assessment (`elements=status`), and legend (`l`). Game/review changes apply to all panels. `?db` continues to select the local AI service. Viewer mode never loads these panels.

### Toolbar shortcuts and colors

Hover or focus a tool to see its name and shortcut. Use 1/2/3 for black/white/alternating stones, 4 for drawing, 5/6/7/8 for triangle/circle/square/letter marks, S for grid, C for coordinates, and K for the color picker. Q switches the alternating stone color. The color picker affects new drawings, marks, triangle stone markers, and shared cursors; existing annotations keep their original colors. Toolbar icons are inline SVGs and do not require an external icon font.

### Load a tournament with a commentary code

In Session Setup, enter your eight-character commentary code and click
**Load tournament**. OverlayTool fetches the tournament from BadukCast and
fills its network room, OBS controller and chat links. Select the game to fill
its camera feed and AI context; a single game is selected automatically.
Then generate host links as usual. The commentary code is never included in
shared links or stored in the browser.

Under **Server settings**, change the BadukCast server for a local or alternate
Orcha instance (for example `http://localhost:8080`). That server needs the
`/api/v1/bootstrap` endpoint. It is also used for generated AI panel links.
Tenjin supplies controller/chat links through tournament `overlaySettings`;
missing links can be entered manually. Loading a code does not start a stream
or activate a game.
