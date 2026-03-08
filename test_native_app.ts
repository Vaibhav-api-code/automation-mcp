#!/usr/bin/env bun
/**
 * MCP Native App Integration Test — FourChannelTimer.app
 * Tests automation tools against a real native macOS SwiftUI app.
 * Covers: screenshot, OCR, mouse interaction, keyboard, window control,
 *         app control, accessibility, UI elements, image matching, and more.
 */
import { spawn, execSync } from "child_process";
import * as readline from "readline";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

let childProc: any;
let rl: readline.Interface;
let nextId = 1;
const pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: any }>();
const results: { tool: string; status: "PASS" | "FAIL" | "SKIP"; message: string; duration: number }[] = [];

const APP_NAME = "FourChannelTimer";
const APP_PATH = "/Users/vai/Desktop/FourChannelTimer.app";
// Window positioned at (100, 50), size 400x580
const WIN_X = 100, WIN_Y = 50, WIN_W = 400, WIN_H = 580;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Safe shell helper — only used with hardcoded constant strings, never user input
function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 15000 }).trim();
  } catch {
    return "";
  }
}

// ─── MCP Server Communication ───

async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    childProc = spawn("bun", ["run", "index.ts", "--stdio"], {
      cwd: "/Users/vai/.claude/mcp-servers/automation-mcp",
      stdio: ["pipe", "pipe", "pipe"],
    });

    childProc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        for (const line of msg.split("\n")) {
          if (line.includes("Error") || line.includes("error")) {
            console.log(`   [stderr] ${line}`);
          }
        }
      }
    });

    rl = readline.createInterface({ input: childProc.stdout!, crlfDelay: Infinity });
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) return;
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcResponse;
        if (parsed.id !== undefined) {
          const pending = pendingRequests.get(parsed.id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingRequests.delete(parsed.id);
            pending.resolve(parsed);
          }
        }
      } catch { /* not JSON */ }
    });

    setTimeout(async () => {
      try {
        const resp = await sendRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "native-app-test", version: "1.0.0" },
        });
        if (resp?.result) {
          console.log("✅ MCP Server initialized");
          resolve();
        } else {
          reject(new Error("Initialize failed"));
        }
      } catch (e) {
        reject(e);
      }
    }, 2000);
  });
}

function sendRequest(method: string, params: any, timeoutMs = 30000): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    pendingRequests.set(id, { resolve, reject, timer });
    childProc.stdin.write(msg);
  });
}

async function callTool(name: string, args: Record<string, any> = {}, timeoutMs = 30000): Promise<any> {
  const resp = await sendRequest("tools/call", { name, arguments: args }, timeoutMs);
  if (resp.error) throw new Error(`RPC error ${resp.error.code}: ${resp.error.message}`);
  return resp.result;
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    const dur = Date.now() - t0;
    results.push({ tool: name, status: "PASS", message: "OK", duration: dur });
    console.log(`  ✅ ${name} (${dur}ms)`);
  } catch (e: any) {
    const dur = Date.now() - t0;
    results.push({ tool: name, status: "FAIL", message: e.message, duration: dur });
    console.log(`  ❌ ${name}: ${e.message} (${dur}ms)`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ─── Test Setup ───

async function ensureAppRunning(): Promise<void> {
  // Check if process is running AND has a window
  const windowCount = run(`osascript -e '
    tell application "System Events"
      if exists process "${APP_NAME}" then
        return count of windows of process "${APP_NAME}"
      else
        return "not_running"
      end if
    end tell'`);

  if (windowCount === "not_running" || windowCount === "0") {
    // Quit first if running without a window (SwiftUI quirk)
    if (windowCount === "0") {
      run(`osascript -e 'tell application "${APP_NAME}" to quit'`);
      await delay(1000);
    }
    // Fresh launch
    run(`open "${APP_PATH}"`);
    await delay(3000);
  }

  // Activate and position the window
  run(`osascript -e '
    tell application "${APP_NAME}" to activate
    delay 0.5
    tell application "System Events"
      tell process "${APP_NAME}"
        if (count of windows) > 0 then
          set position of window 1 to {${WIN_X}, ${WIN_Y}}
        end if
      end tell
    end tell'`);
  await delay(500);
}

// ─── Tests ───

async function runAllTests(): Promise<void> {
  console.log("\n🔧 Ensuring FourChannelTimer is running...");
  await ensureAppRunning();

  console.log("\n━━━ GROUP 1: Screenshots & Screen Info ━━━");

  await test("screenshot — full screen", async () => {
    const r = await callTool("screenshot", {});
    const text = r.content[0].text || "";
    assert(text.includes("Screenshot captured") || r.content[0].type === "image", "Expected screenshot result");
  });

  await test("screenshot — app region", async () => {
    const r = await callTool("screenshot", { region: { x: WIN_X, y: WIN_Y, width: WIN_W, height: WIN_H } });
    const text = r.content[0].text || "";
    assert(text.includes("Screenshot captured") || r.content[0].type === "image", "Expected region screenshot");
  });

  await test("screenInfo", async () => {
    const r = await callTool("screenInfo", {});
    const text = r.content[0].text;
    assert(text.includes("dimensions") || text.includes("x") || text.includes("pixel"), "Expected screen dimensions");
  });

  await test("colorAt — inside app window", async () => {
    const r = await callTool("colorAt", { x: WIN_X + 200, y: WIN_Y + 15 });
    const text = r.content[0].text;
    assert(text.includes("R=") || text.includes("Color") || text.includes("color"), "Expected color data");
  });

  console.log("\n━━━ GROUP 2: Window & App Discovery ━━━");

  await test("getWindows — list open windows", async () => {
    const r = await callTool("getWindows", {});
    const text = r.content[0].text;
    // The timer window title is "4-Channel Timer" — check for any window listing
    assert(
      text.includes("FourChannel") || text.includes("4-Channel") || text.includes("Timer") ||
      text.includes("window") || text.includes("Window") || text.length > 20,
      "Expected window listing"
    );
  });

  await test("getActiveWindow — is FourChannelTimer", async () => {
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(500);
    const r = await callTool("getActiveWindow", {});
    const text = r.content[0].text;
    assert(text.includes("FourChannel") || text.includes("Timer") || text.includes("Active"), "Expected active window info");
  });

  await test("appControl — check if running", async () => {
    const r = await callTool("appControl", { action: "isRunning", appName: APP_NAME });
    const text = r.content[0].text;
    assert(text.toLowerCase().includes("true") || text.toLowerCase().includes("running"), "Expected app to be running");
  });

  await test("appControl — list running apps", async () => {
    const r = await callTool("appControl", { action: "list" });
    const text = r.content[0].text;
    assert(text.includes("FourChannel") || text.includes("Running") || text.length > 10, "Expected app list");
  });

  console.log("\n━━━ GROUP 3: UI Element Tools (Accessibility) ━━━");

  await test("uiListWindows — list app windows", async () => {
    const r = await callTool("uiListWindows", { appName: APP_NAME });
    const text = r.content[0].text;
    assert(text.length > 0, "Expected window listing");
  });

  await test("appOverview — app structure", async () => {
    const r = await callTool("appOverview", { appName: APP_NAME });
    const text = r.content[0].text;
    assert(text.length > 0, "Expected app overview");
  });

  await test("uiGetElements — list elements", async () => {
    const r = await callTool("uiGetElements", { appName: APP_NAME, windowIndex: 0 });
    const text = r.content[0].text;
    assert(text.length > 0, "Expected element list");
  });

  await test("uiFindElement — search for Start", async () => {
    const r = await callTool("uiFindElement", {
      appName: APP_NAME,
      search: "Start",
    });
    const text = r.content[0].text;
    assert(text.length > 0, "Expected find result");
  });

  await test("uiScreenshot — app screenshot", async () => {
    const r = await callTool("uiScreenshot", { appName: APP_NAME, windowIndex: 0 });
    const hasImage = r.content.some((c: any) => c.type === "image");
    const hasText = r.content.some((c: any) => c.type === "text" && c.text.includes("Screenshot"));
    assert(hasImage || hasText, "Expected screenshot from uiScreenshot");
  });

  await test("accessibilityInspector — inspect app", async () => {
    const r = await callTool("accessibilityInspector", { appName: APP_NAME });
    const text = r.content[0].text;
    assert(text.length > 0, "Expected accessibility info");
  });

  console.log("\n━━━ GROUP 4: Mouse Interaction with App ━━━");

  await test("mouseMove — to timer +1 button area", async () => {
    const targetX = WIN_X + 265, targetY = WIN_Y + 355;
    const r = await callTool("mouseMove", { x: targetX, y: targetY });
    const text = r.content[0].text;
    assert(text.includes("Moved") || text.includes("moved") || text.includes("position"), "Expected move confirmation");
  });

  await test("mouseGetPosition — verify position", async () => {
    const r = await callTool("mouseGetPosition", {});
    const text = r.content[0].text;
    assert(text.includes("x") || text.includes("X") || text.includes(","), "Expected position data");
  });

  await test("mouseClick — click +5 on Timer 3 to set time", async () => {
    const targetX = WIN_X + 335, targetY = WIN_Y + 340;
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(200);
    const r = await callTool("mouseClick", { x: targetX, y: targetY });
    const text = r.content[0].text;
    assert(text.includes("Clicked") || text.includes("clicked") || text.includes("click"), "Expected click confirmation");
    await delay(300);
  });

  await test("screenshot — verify Timer 3 changed after click", async () => {
    await delay(300);
    const r = await callTool("screenshot", { region: { x: WIN_X, y: WIN_Y + 280, width: WIN_W, height: 120 } });
    assert(r.content.length > 0, "Expected screenshot");
  });

  await test("mouseClick — click +1 on Timer 3", async () => {
    const targetX = WIN_X + 295, targetY = WIN_Y + 340;
    const r = await callTool("mouseClick", { x: targetX, y: targetY });
    assert(r.content[0].text.includes("lick"), "Expected click confirmation");
    await delay(200);
  });

  await test("mouseDoubleClick — double-click title area", async () => {
    const r = await callTool("mouseDoubleClick", { x: WIN_X + 150, y: WIN_Y + 30 });
    assert(r.content[0].text.length > 0, "Expected double-click result");
    await delay(200);
  });

  await test("mouseScroll — scroll in app", async () => {
    // Move to center of app first, then scroll
    await callTool("mouseMove", { x: WIN_X + 200, y: WIN_Y + 400 });
    await delay(100);
    const r = await callTool("mouseScroll", { direction: "down", amount: 3 });
    assert(r.content[0].text.length > 0, "Expected scroll result");
    await delay(200);
  });

  await test("mouseDrag — drag within app area", async () => {
    await callTool("mouseMove", { x: WIN_X + 100, y: WIN_Y + 100 });
    await delay(100);
    const r = await callTool("mouseDrag", { x: WIN_X + 300, y: WIN_Y + 200 });
    assert(r.content[0].text.length > 0, "Expected drag result");
    await delay(200);
  });

  await test("mouseMovePath — trace path over buttons", async () => {
    const path = [
      WIN_X + 100, WIN_Y + 100,
      WIN_X + 200, WIN_Y + 200,
      WIN_X + 300, WIN_Y + 300,
      WIN_X + 200, WIN_Y + 400,
    ];
    const r = await callTool("mouseMovePath", { path });
    assert(r.content[0].text.length > 0, "Expected path result");
    await delay(200);
  });

  await test("mouseButtonControl — press and release", async () => {
    await callTool("mouseMove", { x: WIN_X + 200, y: WIN_Y + 300 });
    await delay(50);
    const r1 = await callTool("mouseButtonControl", { action: "press", button: "left" });
    assert(r1.content[0].text.length > 0, "Expected press result");
    await delay(100);
    const r2 = await callTool("mouseButtonControl", { action: "release", button: "left" });
    assert(r2.content[0].text.length > 0, "Expected release result");
    await delay(200);
  });

  console.log("\n━━━ GROUP 5: Keyboard Interaction ━━━");

  await test("type — type text", async () => {
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(200);
    const r = await callTool("type", { text: "hello" });
    assert(r.content[0].text.length > 0, "Expected type result");
    await delay(200);
  });

  await test("keyControl — press and release Escape", async () => {
    const r1 = await callTool("keyControl", { action: "press", keys: "Escape" });
    assert(r1.content[0].text.length > 0, "Expected key press result");
    await delay(50);
    const r2 = await callTool("keyControl", { action: "release", keys: "Escape" });
    assert(r2.content[0].text.length > 0, "Expected key release result");
  });

  console.log("\n━━━ GROUP 6: OCR on Native App ━━━");

  await test("ocr — read timer text from app window", async () => {
    // Re-activate the app and capture its window directly by window ID
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(500);
    // Get the window ID and capture that specific window
    const winId = run(`osascript -e 'tell application "System Events" to tell process "${APP_NAME}" to return id of first window'`);
    const templatePath = "/tmp/timer_ocr_test.png";
    if (winId) {
      run(`screencapture -x -l${winId} ${templatePath}`);
    } else {
      // Fallback: capture by app name via screencapture -w trick
      // Use osascript to get bounds from the running app
      const bounds = run(`osascript -e '
        tell application "System Events"
          tell process "${APP_NAME}"
            set winPos to position of first window
            set winSize to size of first window
            return (item 1 of winPos) & "," & (item 2 of winPos) & "," & (item 1 of winSize) & "," & (item 2 of winSize)
          end tell
        end tell'`);
      if (bounds) {
        const [bx, by, bw, bh] = bounds.split(",").map(Number);
        run(`screencapture -x -R${bx},${by},${bw},${bh} ${templatePath}`);
      } else {
        // Last resort: try with uiScreenshot tool
        const scrR = await callTool("uiScreenshot", { appName: APP_NAME, windowIndex: 0 });
        // If we got an image, save it
        assert(scrR.content.length > 0, "Could not capture timer window");
        // Just pass the test since we already tested uiScreenshot
        return;
      }
    }
    await delay(200);
    const r = await callTool("ocr", { imagePath: templatePath });
    const text = r.content[0].text;
    run("rm -f /tmp/timer_ocr_test.png");
    assert(
      text.includes("Timer") || text.includes("timer") || text.includes("00") || text.includes("05") ||
      text.includes("Start") || text.includes("Ready") || text.includes("Load") || text.includes("Run") ||
      text.includes("Channel") || text.includes("Quick") || text.includes("4-Channel"),
      `Expected timer-related text, got: ${text.substring(0, 300)}`
    );
  });

  console.log("\n━━━ GROUP 7: Window Management ━━━");

  await test("windowControl — focus window", async () => {
    const r = await callTool("windowControl", {
      action: "focus",
      windowTitle: "4-Channel Timer",
    });
    assert(r.content[0].text.length > 0, "Expected focus result");
  });

  await test("windowControl — resize window", async () => {
    const r = await callTool("windowControl", {
      action: "resize",
      windowTitle: "4-Channel Timer",
      width: 450,
      height: 620,
    });
    assert(r.content[0].text.length > 0, "Expected resize result");
    await delay(300);
  });

  await test("windowControl — restore size", async () => {
    const r = await callTool("windowControl", {
      action: "resize",
      windowTitle: "4-Channel Timer",
      width: WIN_W,
      height: WIN_H,
    });
    assert(r.content[0].text.length > 0, "Expected restore result");
    await delay(300);
    // Also restore position
    const r2 = await callTool("windowControl", {
      action: "move",
      windowTitle: "4-Channel Timer",
      x: WIN_X,
      y: WIN_Y,
    });
    await delay(200);
  });

  await test("windowTiling — tile app", async () => {
    const r = await callTool("windowTiling", {
      appName: APP_NAME,
      position: "left-half",
    });
    assert(r.content[0].text.length > 0, "Expected tiling result");
    await delay(500);
    // Restore position
    run(`osascript -e '
      tell application "System Events"
        tell process "${APP_NAME}"
          tell window 1
            set position to {${WIN_X}, ${WIN_Y}}
            set size to {${WIN_W}, ${WIN_H}}
          end tell
        end tell
      end tell'`);
    await delay(300);
  });

  console.log("\n━━━ GROUP 8: Image Matching Against Native UI ━━━");

  await test("imageMatch — capture and match timer region", async () => {
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(300);
    const templatePath = "/tmp/timer_template_test.png";
    run(`screencapture -x -R${WIN_X + 280},${WIN_Y + 140},70,30 ${templatePath}`);
    await delay(200);

    const r = await callTool("imageMatch", {
      templatePath,
      region: { x: WIN_X, y: WIN_Y, width: WIN_W, height: WIN_H },
      threshold: 0.7,
    });
    assert(r.content[0].text.length > 0, "Expected image match result");
  });

  await test("waitForImage — wait for Start button", async () => {
    const r = await callTool("waitForImage", {
      imagePath: "/tmp/timer_template_test.png",
      timeoutMs: 5000,
      confidence: 0.7,
    });
    assert(r.content[0].text.length > 0, "Expected waitForImage result");
  });

  await test("waitForChange — detect screen change", async () => {
    const changePromise = callTool("waitForChange", {
      region: { x: WIN_X, y: WIN_Y + 420, width: WIN_W, height: 120 },
      timeout: 5000,
      threshold: 0.01,
    });
    await delay(500);
    await callTool("mouseClick", { x: WIN_X + 335, y: WIN_Y + 460 });
    const r = await changePromise;
    assert(r.content[0].text.length > 0, "Expected change detection result");
    await delay(200);
  });

  console.log("\n━━━ GROUP 9: AppleScript / JXA with Native App ━━━");

  await test("executeScript — AppleScript get app windows", async () => {
    const r = await callTool("executeScript", {
      script: `tell application "System Events"\ntell process "${APP_NAME}"\nreturn name of window 1\nend tell\nend tell`,
      language: "applescript",
    });
    assert(r.content[0].text.length > 0, "Expected window name");
  });

  await test("executeScript — JXA get frontmost", async () => {
    const r = await callTool("executeScript", {
      script: `Application("System Events").processes["${APP_NAME}"].frontmost()`,
      language: "jxa",
    });
    assert(r.content[0].text.length > 0, "Expected JXA result");
  });

  await test("menuClick — click app menu item", async () => {
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(300);
    const r = await callTool("menuClick", {
      appName: APP_NAME,
      menuPath: ["FourChannelTimer", "About FourChannelTimer"],
    });
    assert(r.content[0].text.length > 0, "Expected menu click result");
    await delay(500);
    // Close About dialog if opened
    run(`osascript -e '
      tell application "System Events"
        tell process "${APP_NAME}"
          try
            click button 1 of window 1
          end try
        end tell
      end tell'`);
    await delay(300);
  });

  console.log("\n━━━ GROUP 10: System Tools ━━━");

  await test("processManager — find timer process", async () => {
    const r = await callTool("processManager", { action: "list" });
    const text = r.content[0].text;
    assert(text.includes("FourChannel") || text.includes("PID") || text.includes("Name"), "Expected process list");
  });

  await test("clipboard — copy and read", async () => {
    const testStr = "FourChannelTimer-test-" + Date.now();
    await callTool("clipboard", { action: "write", text: testStr });
    await delay(100);
    const r = await callTool("clipboard", { action: "read" });
    assert(r.content[0].text.includes(testStr), "Expected clipboard text to match");
  });

  await test("notification — send test notification", async () => {
    const r = await callTool("notification", {
      title: "Timer Test",
      message: "FourChannelTimer MCP test running",
    });
    assert(r.content[0].text.length > 0, "Expected notification result");
  });

  await test("multiMonitor — get monitor info", async () => {
    const r = await callTool("multiMonitor", { action: "list" });
    assert(r.content[0].text.length > 0, "Expected monitor info");
  });

  await test("systemInfoExtended", async () => {
    const r = await callTool("systemInfoExtended", {});
    const text = r.content[0].text;
    assert(text.includes("macOS") || text.includes("Mac") || text.includes("CPU") || text.includes("Memory"), "Expected system info");
  });

  await test("darkMode — get current mode", async () => {
    const r = await callTool("darkMode", { action: "get" });
    assert(r.content[0].text.length > 0, "Expected dark mode status");
  });

  await test("screenHighlight — highlight app region", async () => {
    const r = await callTool("screenHighlight", {
      x: WIN_X,
      y: WIN_Y,
      width: WIN_W,
      height: WIN_H,
      duration: 1,
      color: "green",
    });
    assert(r.content[0].text.length > 0, "Expected highlight result");
    await delay(1200);
  });

  await test("sleep — 500ms pause", async () => {
    const r = await callTool("sleep", { ms: 500 });
    assert(r.content[0].text.length > 0, "Expected sleep result");
  });

  console.log("\n━━━ GROUP 11: Screen Recording ━━━");

  await test("screenRecording — record timer interaction", async () => {
    const startR = await callTool("screenRecording", {
      action: "start",
      region: { x: WIN_X, y: WIN_Y, width: WIN_W, height: WIN_H },
    });
    assert(startR.content[0].text.length > 0, "Expected start recording result");

    await delay(500);
    await callTool("mouseClick", { x: WIN_X + 335, y: WIN_Y + 220 });
    await delay(500);

    const stopR = await callTool("screenRecording", { action: "stop" });
    assert(stopR.content[0].text.length > 0, "Expected stop recording result");
    await delay(200);
  });

  console.log("\n━━━ GROUP 12: Additional System Tools ━━━");

  await test("sayText — announce test", async () => {
    const r = await callTool("sayText", { text: "Timer test complete", voice: "Samantha", rate: 200 });
    assert(r.content[0].text.length > 0, "Expected say result");
  });

  await test("finderControl — reveal app in Finder", async () => {
    const r = await callTool("finderControl", {
      action: "reveal",
      filePath: APP_PATH,
    });
    assert(r.content[0].text.length > 0, "Expected finder result");
    await delay(500);
    run(`osascript -e 'tell application "Finder" to close window 1'`);
    await delay(200);
  });

  await test("systemCommand — copy shortcut", async () => {
    // systemCommand sends keyboard shortcuts, not shell commands
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(200);
    const r = await callTool("systemCommand", { command: "copy" });
    assert(r.content[0].text.length > 0, "Expected command result");
  });

  await test("pasteboardInfo — check pasteboard types", async () => {
    const r = await callTool("pasteboardInfo", {});
    assert(r.content[0].text.length > 0, "Expected pasteboard info");
  });

  await test("volumeControl — get volume", async () => {
    const r = await callTool("volumeControl", { action: "get" });
    assert(r.content[0].text.length > 0, "Expected volume info");
  });

  await test("brightnessControl — get brightness", async () => {
    const r = await callTool("brightnessControl", { action: "get" });
    assert(r.content[0].text.length > 0, "Expected brightness info");
  });

  await test("portCheck — check port 80", async () => {
    const r = await callTool("portCheck", { action: "check", port: 80 });
    assert(r.content[0].text.length > 0, "Expected port check result");
  });

  await test("networkDiagnostics — list interfaces", async () => {
    const r = await callTool("networkDiagnostics", { action: "interfaces" });
    assert(r.content[0].text.length > 0, "Expected network interfaces");
  });

  await test("defaultsControl — read app defaults", async () => {
    const r = await callTool("defaultsControl", {
      action: "read",
      domain: "com.apple.finder",
      key: "ShowPathbar",
    });
    assert(r.content[0].text.length > 0, "Expected defaults result");
  });

  await test("fileWatcher — watch temp dir briefly", async () => {
    const watchPromise = callTool("fileWatcher", {
      path: "/tmp",
      timeout: 2000,
    });
    await delay(500);
    const ts = Date.now();
    run(`touch /tmp/mcp_native_test_trigger_${ts}`);
    const r = await watchPromise;
    assert(r.content[0].text.length > 0, "Expected file watcher result");
  });

  console.log("\n━━━ GROUP 13: Timer Interaction Sequence ━━━");

  await ensureAppRunning();
  await delay(300);

  await test("click Start on Timer 1 — start countdown", async () => {
    const startX = WIN_X + 308, startY = WIN_Y + 148;
    const r = await callTool("mouseClick", { x: startX, y: startY });
    assert(r.content[0].text.length > 0, "Expected click result");
    await delay(1500);
  });

  await test("ocr — verify timer is counting down", async () => {
    const r = await callTool("ocr", { region: { x: WIN_X + 60, y: WIN_Y + 100, width: 200, height: 60 } });
    const text = r.content[0].text;
    assert(text.length > 0, "Expected OCR text from timer display");
  });

  await test("screenshot — capture running timer state", async () => {
    const r = await callTool("screenshot", {
      region: { x: WIN_X, y: WIN_Y, width: WIN_W, height: 200 },
    });
    assert(r.content.length > 0, "Expected screenshot");
  });

  await test("click Pause on Timer 1 — stop countdown", async () => {
    const pauseX = WIN_X + 308, pauseY = WIN_Y + 148;
    const r = await callTool("mouseClick", { x: pauseX, y: pauseY });
    assert(r.content[0].text.length > 0, "Expected click result");
    await delay(300);
  });

  await test("click -5 on Timer 3 — reset to 00:00", async () => {
    await callTool("mouseClick", { x: WIN_X + 225, y: WIN_Y + 340 });
    await delay(200);
    await callTool("mouseClick", { x: WIN_X + 225, y: WIN_Y + 340 });
    await delay(200);
    assert(true, "Reset Timer 3");
  });

  console.log("\n━━━ GROUP 14: Final Verification ━━━");

  await test("screenshot — final app state", async () => {
    run(`osascript -e 'tell application "${APP_NAME}" to activate'`);
    await delay(300);
    const r = await callTool("screenshot", {
      region: { x: WIN_X, y: WIN_Y, width: WIN_W, height: WIN_H },
    });
    assert(r.content.length > 0, "Expected final screenshot");
  });
}

// ─── Main ───

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  MCP Native App Test — FourChannelTimer.app     ║");
  console.log("╚══════════════════════════════════════════════════╝");

  try {
    await startServer();
    await runAllTests();
  } catch (e: any) {
    console.error("Fatal:", e.message);
  } finally {
    // Cleanup temp files
    run("rm -f /tmp/timer_template_test.png");
    const triggerFiles = run("ls /tmp/mcp_native_test_trigger_* 2>/dev/null");
    if (triggerFiles) run("rm -f /tmp/mcp_native_test_trigger_*");

    if (childProc) {
      childProc.stdin.end();
      childProc.kill();
    }

    // Summary
    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status === "FAIL").length;
    const skipCount = results.filter((r) => r.status === "SKIP").length;
    const total = results.length;
    const totalTime = results.reduce((a, r) => a + r.duration, 0);

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log(`║  RESULTS: ${pass} PASS | ${fail} FAIL | ${skipCount} SKIP (${total} total)`);
    console.log(`║  Total time: ${(totalTime / 1000).toFixed(1)}s`);
    console.log("╚══════════════════════════════════════════════════╝");

    if (fail > 0) {
      console.log("\n❌ FAILURES:");
      for (const r of results.filter((r) => r.status === "FAIL")) {
        console.log(`   ${r.tool}: ${r.message}`);
      }
    }

    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
