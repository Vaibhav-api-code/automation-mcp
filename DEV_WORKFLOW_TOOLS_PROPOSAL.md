# Dev Workflow Tools for automation-mcp — Implementation Plan

**Related Code Files:**
- `/Users/vai/.claude/mcp-servers/automation-mcp/index.ts` — All tool implementations

---

## Overview

Add 10 macOS-native dev workflow tools (Tools 36-45) to the private automation-mcp server. These tools fill capability gaps needed during development and verification workflows — reading UI state, arranging windows, checking ports, watching files, searching with Spotlight, etc.

## Architecture

All tools follow the existing `server.addTool()` pattern with Zod validation. They reuse the shared `runAppleScript()` and `escapeForAppleScript()` helpers added in the prior osascript batch. No new dependencies are introduced — all tools use macOS built-in CLIs (`lsof`, `mdfind`, `screencapture`, `curl`, `dig`, `defaults`, `ping`, `qlmanage`, `ifconfig`).

## Tools Specification

### Tool 36: `accessibilityInspector`

**Purpose:** Read the accessibility tree of a macOS app window — roles, titles, values, enabled states. Essential for programmatic UI verification without screenshots.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| appName | string | yes | — | Process name (e.g., "Safari") |
| windowIndex | number | no | 1 | Which window (1-based) |
| maxDepth | number | no | 4 | Tree traversal depth (1-10) |
| filter | string | no | — | Filter by role/title substring |

**Implementation:** Generates dynamic AppleScript that walks `UI elements` of the target window up to `maxDepth` levels. Each element emits `[role] title = value (disabled?)`. Filter is applied client-side after full tree retrieval.

**Key Design Decisions:**
- AppleScript is generated dynamically based on maxDepth (unrolled loops, not recursive — AppleScript has no good recursion)
- 30s timeout to handle large UI trees
- Error handling: checks window count before traversal, reports if app lacks Accessibility permission

**Security:** App name is escaped via `escapeForAppleScript()`. No shell interpolation.

---

### Tool 37: `windowTiling`

**Purpose:** Snap windows to screen halves, quarters, center, maximize, or custom position/size. Enables consistent dev environment setup.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| appName | string | yes | — | App to tile |
| position | enum | yes | — | left-half, right-half, top-half, bottom-half, top-left, top-right, bottom-left, bottom-right, center, maximize, custom |
| x, y, width, height | number | for custom | — | Exact coordinates |

**Implementation:** Gets screen bounds from Finder desktop, calculates target rectangle accounting for 25px menu bar, sets window position/size via System Events.

**Key Design Decisions:**
- Menu bar height hardcoded at 25px (standard macOS)
- Center mode uses 60% width, 70% height
- Activates app before positioning to ensure window is accessible

---

### Tool 38: `portCheck`

**Purpose:** Check if a port is in use and by what process, or list all listening ports. Critical for dev server verification.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| action | enum | yes | — | "check" or "list" |
| port | number | for check | — | Port to check (1-65535) |
| protocol | enum | no | "tcp" | tcp, udp, or both |

**Implementation:** Uses `lsof -i` with protocol and port filters. Handles exit code 1 (no matches) as "port is free" rather than error.

---

### Tool 39: `fileWatcher`

**Purpose:** Block until a file/directory changes or timeout expires. Useful for waiting on build output, log updates, file creation.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| path | string | yes | — | File/dir to watch |
| timeoutSeconds | number | no | 30 | Max wait (1-300) |
| event | enum | no | "any" | any, create, modify, delete |

**Implementation:** Polls file stat (mtime + size) every 250ms. For "create" events on non-existent files, watches parent directory. Reports elapsed time on detection.

**Key Design Decisions:**
- Polling at 250ms (not fswatch) to avoid dependency and ensure cross-version compatibility
- Compares both mtime AND size to catch all modification types
- 300s max timeout to prevent indefinite blocking

---

### Tool 40: `quickLook`

**Purpose:** Preview files using macOS Quick Look. Opens a temporary preview window for visual verification of generated PDFs, images, documents.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| filePath | string | yes | — | File to preview |
| seconds | number | no | 5 | Preview duration (1-30) |

**Implementation:** Spawns `qlmanage -p` detached, waits N seconds, then SIGTERM. Returns file metadata (extension, size).

---

### Tool 41: `spotlightSearch`

**Purpose:** Find files using macOS Spotlight index. Dramatically faster than recursive grep for indexed directories.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| query | string | yes | — | Search query |
| searchType | enum | no | "name" | name, content, or raw query |
| directory | string | no | — | Limit to directory |
| maxResults | number | no | 20 | Max results (1-100) |

**Implementation:** Maps searchType to `mdfind -name` vs plain `mdfind`. Truncates results to maxResults. Reports total count.

---

### Tool 42: `pasteboardInfo`

**Purpose:** Get clipboard data types and format info. Verifies copy operations include correct formats (HTML, RTF, image, etc.).

**Parameters:** None.

**Implementation:** Uses `clipboard info` via AppleScript to get type list, plus `pbpaste` for text preview (first 200 chars).

---

### Tool 43: `screenRecording`

**Purpose:** Start/stop screen recording for test evidence or demo capture.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| action | enum | yes | — | start, stop, status |
| outputPath | string | no | ~/Desktop/recording-{ts}.mov | Output file |
| duration | number | no | — | Auto-stop after N seconds (max 300) |
| audioEnabled | boolean | no | false | Capture system audio |

**Implementation:** Uses `screencapture -v -k` (video + keyboard-stop). PID tracked in `/tmp/automation-mcp-screenrecord.pid`. Stop sends SIGINT for clean finalization. Optional auto-stop via setTimeout.

**Key Design Decisions:**
- PID file prevents multiple concurrent recordings
- SIGINT (not SIGTERM) for clean .mov finalization
- 1s delay after stop for file write completion

---

### Tool 44: `defaultsControl`

**Purpose:** Read/write macOS plist preferences. Toggle app settings, check config values for tests.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| action | enum | yes | — | read, write, delete, domains |
| domain | string | for r/w/d | — | Preference domain |
| key | string | for w/d | — | Preference key |
| value | string | for write | — | Value to write |
| valueType | enum | no | "string" | string, int, float, bool, array-add |

**Implementation:** Direct wrapper around macOS `defaults` CLI. Supports reading all keys in a domain, writing typed values, and listing all domains.

---

### Tool 45: `networkDiagnostics`

**Purpose:** Network diagnostic utilities for dev workflows — ping, DNS, HTTP check, interface listing.

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| action | enum | yes | — | ping, dns, http, interfaces |
| host | string | for p/d/h | — | Target hostname |
| count | number | no | 3 | Ping count (max 10) |
| timeout | number | no | 5 | Timeout seconds (max 30) |

**Implementation:**
- **ping**: `ping -c N -W timeout host`
- **dns**: `dig +short host` with fallback to `host`
- **http**: `curl -sS -o /dev/null -w "status|time|size|ip"` — reports HTTP code, response time, size, remote IP
- **interfaces**: Parses `ifconfig` output for interface → IP mapping

---

## Security Considerations

1. **AppleScript injection**: All user strings escaped via `escapeForAppleScript()` before interpolation
2. **Command injection**: All CLI tools use `execFileSync` (not `exec`) — arguments are array-based, no shell interpretation
3. **File paths**: Resolved via `path.resolve()` before use
4. **Destructive ops**: `finderControl.emptyTrash` requires explicit "CONFIRM" string
5. **Timeouts**: All CLI calls have timeouts to prevent hanging
6. **PID file**: Screen recording uses `/tmp/` pid file — checked for process liveness before reuse

## Verification Plan

1. TypeScript compilation via `bun build` — PASSED
2. Smoke tests of underlying CLI commands — PASSED (lsof, mdfind, curl, ping all verified)
3. Integration test: start MCP server, invoke each tool via Claude Code
4. Edge cases: non-existent apps, invalid ports, missing files, timeout expiry
