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
* Scene list and preview layouts now come from BadukCast's shared OBS scene template
```

Clock, Dashboard/OBS, Video, OGS/Games, Frontend/AI recovery, and VDO URL fixes
belong to BadukCast. OverlayTool owns the Overlay, Chat, and Tenjin Scenes work.
Scene switching has been tested with a simulated OBS relay. Real Dashboard OBS
and dual-stream testing, host-controlled intro countdown, and live usability
feedback remain outstanding. Preview availability depends on the Tenjin pages.

### Scene regression check

The test serves this repository itself:

```sh
deno run -A --no-lock tests/scene-picker.mjs
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if Chromium is installed elsewhere. The
test mocks BadukCast's scene template API, external frames, and the OBS relay,
and checks template-driven cards, composite previews, scene commands,
confirmation, disconnect handling, the default-scene fallback, and shared links.

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
- **Scenes** opens a modal with one preview per scene in BadukCast's shared OBS scene template (edited in BadukCast under **Dashboard → OBS → Template**), in template order. Clicking a preview requests the OBS scene with that name.
- The template is loaded from `{aiOrigin}/broadcaster/api/template`, the BadukCast server this link belongs to. Each preview composes the scene on a scaled 1920×1080 canvas: browser sources as page previews, colour sources as boxes, hidden sources omitted.
- `{pc}` in a browser source URL is replaced with the table's mini-PC ID (unless the source is marked the same on every PC). Previews only load `http(s)` pages and cannot be clicked into.
- If the template cannot be loaded, the default scenes `Main` (`/stream-overlay/{pc}`), `Intro` (`/intro/{pc}`), `Hosts` (`/hosts/{pc}`), `Interview` (`/interview/{pc}`), `Break` (`/stream-break`), and `Goodbye` (`/stream-goodbye`, both the same on every PC) on `https://app.baduk.club` are shown with a short note. Opening the modal retries the template.
- **Preview settings** (also under **Session Setup > Advanced**) sets the mini-PC ID (default `3`); click **Apply settings** to update generated links. Shared links include `miniPc`.
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

### Scene Parameters

- `miniPc` sets the positive numeric mini-PC ID (default `3`) that replaces `{pc}` in scene previews. It overrides the value saved in this browser.
- `aiOrigin` is the BadukCast server whose scene template is shown. Scene names and layouts are not URL parameters; change them in BadukCast under **Dashboard → OBS → Template**.

Clicking a preview requests its scene when OBS is connected. The Live indicator changes after OBS confirms the switch.

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
- **Scenes**: Open the scene preview modal and click a preview to request that OBS scene through VDO Ninja.

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

## Link
[Board-Overlay Tool](https://weiqipro.github.io/Board-Overlay/)

### Featured chat on the board feed

Commentators see compact highlighted Social Stream messages over the board feed. Reading time is 250 ms per word (four words per second), with a one-second minimum and a short entrance-animation allowance. A read-only connection to the Social Stream featured-message channel supplies the word count; if that connection is unavailable, the popup uses a two-second fallback. The overlay does not intercept board drawing or clicks and is not loaded in viewer mode. The chat panel displays "Click Message To Highlight" above the chat.

The featured overlay uses the session in a Social Stream `Chat` URL, or defaults to `zyab4FcJGh`. Set `chatSession=YOUR_SESSION` in the commentator URL to override both the featured overlay and a Social Stream sidebar chat. This setting is preserved in generated commentator links; other chat providers are unchanged. Full simultaneous-stream session management is deferred.

A circular close button appears beside the lower-left highlighted popup. It dismisses only the local commentator overlay and returns focus to the board. Later highlights appear normally; dismissal does not clear the broadcast highlight or affect other commentators.

AI views use BadukCast element parameters: board (`board`), winrate (`e=b,w,bar`), territory (`t=bp,bi,wp,wi,bar`), area (`a=b,w,u,bar`), players (`p=b,w`), pie (`pie`), move assessment (`elements=status`), and legend (`l`). Game/review changes apply to all panels. `?db` continues to select the local AI service. Viewer mode never loads these panels.

### Toolbar shortcuts and colors

Hover or focus a tool to see its name and shortcut. Use 1/2/3 for black/white/alternating stones, 4 for drawing, 5/6/7/8 for triangle/circle/square/letter marks, S for grid, C for coordinates, and K for the color picker. Q switches the alternating stone color. The color picker affects new drawings, marks, triangle stone markers, and shared cursors; existing annotations keep their original colors. Toolbar icons are inline SVGs and do not require an external icon font.

### Join with a commentary code

On the start page, enter your eight-character commentary code and your name,
then click **Join**. OverlayTool loads the tournament from BadukCast and opens
the commentator view straight away: network room, OBS controller, chat, the
camera feed and AI analysis for the game being played now. If the tournament
has several games, a game switcher appears in the top bar; it also follows the
next active game between rounds unless you picked one yourself.

The code is kept only in memory (for the timer and AI panels). It is never put
in links or saved in the browser. Under **Server settings**, change the
BadukCast server for a local or alternate Orcha (for example
`http://localhost:8080`). Session Setup below the join box is for organisers
who build links by hand.

