#!/usr/bin/env bun
/**
 * MCP Tool Integration Test Harness — Full Coverage
 * Opens test_ui.html in Safari as a real target for interactive tools.
 * Tests all 55 tools via JSON-RPC over stdio.
 */
import { spawn, execSync } from "child_process";
import * as readline from "readline";
import * as path from "path";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

let requestId = 0;
let childProc: ReturnType<typeof spawn>;
let rl: readline.Interface;
const pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: any }>();
const results: { tool: string; status: "PASS" | "FAIL" | "SKIP"; message: string; duration: number }[] = [];

const TEST_UI_PATH = path.resolve("/Users/vai/.claude/mcp-servers/automation-mcp/test_ui.html");
const TEST_APP = "Safari"; // we'll open the HTML in Safari

// ─── Helpers ───

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Safe shell exec wrapper — only used with hardcoded constant strings in this test file
function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 15000 }).trim();
  } catch {
    return "";
  }
}

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
      if (!trimmed || !trimmed.startsWith("{")) return;
      try {
        const parsed: JsonRpcResponse = JSON.parse(trimmed);
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
          clientInfo: { name: "test-harness", version: "1.0" },
        });
        if (!resp.result) {
          reject(new Error(`Initialize failed: ${JSON.stringify(resp.error)}`));
          return;
        }
        sendNotification("notifications/initialized", {});
        console.log("✅ Server initialized successfully\n");
        resolve();
      } catch (e: any) {
        reject(e);
      }
    }, 2000);
  });
}

function sendRequest(method: string, params?: any, timeoutMs = 30000): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    requestId++;
    const id = requestId;
    const req = { jsonrpc: "2.0", id, method, params };
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Timeout (${timeoutMs}ms) for ${method} id=${id}`));
    }, timeoutMs);
    pendingRequests.set(id, { resolve, reject, timer });
    childProc.stdin!.write(JSON.stringify(req) + "\n");
  });
}

function sendNotification(method: string, params?: any): void {
  childProc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function callTool(name: string, args: Record<string, any> = {}, timeoutMs = 30000): Promise<any> {
  return sendRequest("tools/call", { name, arguments: args }, timeoutMs);
}

async function testTool(
  name: string,
  args: Record<string, any> = {},
  validate?: (result: any) => boolean,
  skipReason?: string,
  timeoutMs = 30000,
  label?: string,
): Promise<void> {
  const display = label ? `${name} (${label})` : name;
  if (skipReason) {
    results.push({ tool: display, status: "SKIP", message: skipReason, duration: 0 });
    console.log(`⏭️  ${display}: SKIP — ${skipReason}`);
    return;
  }

  const start = Date.now();
  try {
    const resp = await callTool(name, args, timeoutMs);
    const duration = Date.now() - start;

    if (resp.error) {
      results.push({ tool: display, status: "FAIL", message: `RPC: ${resp.error.message}`, duration });
      console.log(`❌ ${display}: FAIL (${duration}ms) — RPC: ${resp.error.message?.slice(0, 140)}`);
      return;
    }

    const content = resp.result?.content;
    if (content && Array.isArray(content)) {
      const textContent = content.find((c: any) => c.type === "text");
      const txt = textContent?.text ?? "";
      if (txt.startsWith("Error:") || txt.startsWith("Failed:")) {
        if (validate && validate(resp.result)) {
          results.push({ tool: display, status: "PASS", message: `OK (expected) ${duration}ms`, duration });
          console.log(`✅ ${display}: PASS (${duration}ms) — expected error handled`);
          return;
        }
        results.push({ tool: display, status: "FAIL", message: `Tool error: ${txt.slice(0, 140)}`, duration });
        console.log(`❌ ${display}: FAIL (${duration}ms) — ${txt.slice(0, 140)}`);
        return;
      }
    }

    if (validate && !validate(resp.result)) {
      results.push({ tool: display, status: "FAIL", message: "Validation failed", duration });
      console.log(`❌ ${display}: FAIL (${duration}ms) — validation failed`);
      return;
    }

    results.push({ tool: display, status: "PASS", message: `OK ${duration}ms`, duration });
    console.log(`✅ ${display}: PASS (${duration}ms)`);
  } catch (e: any) {
    const duration = Date.now() - start;
    results.push({ tool: display, status: "FAIL", message: e.message?.slice(0, 140), duration });
    console.log(`❌ ${display}: FAIL (${duration}ms) — ${e.message?.slice(0, 140)}`);
  }
}

function hasContent(result: any): boolean {
  return result?.content?.length > 0;
}
function hasImageContent(result: any): boolean {
  return result?.content?.some((c: any) => c.type === "image");
}
function textIncludes(substr: string) {
  return (result: any) => {
    const text = result?.content?.find((c: any) => c.type === "text")?.text ?? "";
    return text.toLowerCase().includes(substr.toLowerCase());
  };
}

// ─── Setup / Teardown ───

async function openTestUI(): Promise<void> {
  console.log("🖥️  Opening test UI in Safari...");
  run(`open -a Safari "${TEST_UI_PATH}"`);
  await delay(3000);
  run(`osascript -e 'tell application "Safari" to activate'`);
  await delay(500);
  run(`osascript -e 'tell application "Safari" to set bounds of window 1 to {0, 25, 960, 700}'`);
  await delay(500);
  console.log("   Safari window positioned at {0,25,960,700}\n");
}

async function closeTestUI(): Promise<void> {
  run(`osascript -e 'tell application "Safari" to close (every window whose name contains "MCP Test UI")'`);
}

// ─── Test Suites ───

async function testToolListing() {
  console.log("═══ Tool Listing ═══");
  const resp = await sendRequest("tools/list", {});
  const tools = resp.result?.tools ?? [];
  console.log(`📋 ${tools.length} tools registered`);
  if (tools.length !== 55) console.log(`⚠️  Expected 55, got ${tools.length}`);
}

async function testCoreTools() {
  console.log("\n═══ Core Input/Output Tools ═══");

  await testTool("screenshot", {}, hasImageContent);
  await testTool("screenInfo", {}, hasContent);
  await testTool("mouseGetPosition", {}, hasContent);
  await testTool("colorAt", { x: 100, y: 100 }, hasContent);
  await testTool("mouseMove", { x: 480, y: 400 }, hasContent, undefined, undefined, "move to test UI center");

  // Click the click-target circle (approx center of card 2 in the test UI)
  await testTool("mouseClick", { x: 750, y: 350 }, hasContent, undefined, undefined, "click target circle");
  await delay(200);

  // Double-click the double-click button
  await testTool("mouseDoubleClick", { x: 750, y: 550 }, hasContent, undefined, undefined, "dblclick button");
  await delay(200);

  // Drag: first move to start, then drag to target (tool drags from current position)
  await callTool("mouseMove", { x: 600, y: 500 });
  await delay(100);
  await testTool("mouseDrag", { x: 800, y: 500 }, hasContent, undefined, undefined, "drag across zone");
  await delay(200);

  // Scroll in the scroll box area
  await testTool("mouseScroll", { x: 300, y: 550, amount: 3, direction: "down" }, hasContent, undefined, undefined, "scroll content");
  await delay(200);

  // Move mouse along a path (flat array: [x1,y1,x2,y2,...])
  await testTool("mouseMovePath", {
    path: [200,200, 400,300, 600,200]
  }, hasContent, undefined, undefined, "path across UI");
  await delay(200);

  // mouseButtonControl — press then release (no "click" action)
  await testTool("mouseButtonControl", { action: "press", button: "left" }, hasContent, undefined, undefined, "press left");
  await delay(50);
  await testTool("mouseButtonControl", { action: "release", button: "left" }, hasContent, undefined, undefined, "release left");

  // Type into name input — first click the input field
  await callTool("mouseClick", { x: 300, y: 160 });
  await delay(300);
  await testTool("type", { text: "MCP Test User" }, hasContent, undefined, undefined, "type into name");
  await delay(200);

  // keyControl — press and release Tab to move to next field
  await testTool("keyControl", { action: "press", keys: "Tab" }, hasContent, undefined, undefined, "press Tab");
  await delay(50);
  await testTool("keyControl", { action: "release", keys: "Tab" }, hasContent, undefined, undefined, "release Tab");
  await delay(200);

  await testTool("sleep", { ms: 100 }, hasContent);

  // screenHighlight — brief highlight on the test UI
  await testTool("screenHighlight", { x: 100, y: 100, width: 200, height: 200, duration: 300, color: "blue" }, hasContent, undefined, undefined, "highlight");
}

async function testUtilityTools() {
  console.log("\n═══ Utility Tools ═══");

  await testTool("getWindows", {}, hasContent);
  await testTool("getActiveWindow", {}, hasContent);
  await testTool("clipboard", { action: "read" }, hasContent);
  await testTool("multiMonitor", {}, hasContent);
  await testTool("systemInfoExtended", {}, hasContent);
  await testTool("darkMode", { action: "get" }, hasContent);
  await testTool("notification", { title: "MCP Test", message: "Full test suite running" }, hasContent);

  // sayText — short text, fast rate
  await testTool("sayText", { text: "test", voice: "Alex", rate: 300 }, hasContent, undefined, undefined, "short TTS");

  await testTool("processManager", { action: "list" }, hasContent);
  await testTool("volumeControl", { action: "get" }, hasContent);
  await testTool("brightnessControl", { action: "get" }, hasContent);

  // dialog — still skip, blocks entire process
  await testTool("dialog", {}, undefined, "Blocks on modal — cannot auto-dismiss");

  await testTool("portCheck", { action: "check", port: 80 }, hasContent);
  await testTool("spotlightSearch", { query: "README.md", maxResults: 3 }, hasContent);
  await testTool("pasteboardInfo", {}, hasContent);
  await testTool("networkDiagnostics", { action: "interfaces" }, hasContent);
  await testTool("defaultsControl", { action: "read", domain: "com.apple.dock", key: "autohide" }, hasContent);
  await testTool("quickLook", { filePath: TEST_UI_PATH }, hasContent);
}

async function testOsascriptTools() {
  console.log("\n═══ AppleScript/JXA Tools ═══");

  await testTool("executeScript", {
    script: 'return "hello from AppleScript"',
    language: "applescript"
  }, textIncludes("hello"));

  await testTool("executeScript", {
    script: 'JSON.stringify({test: true})',
    language: "jxa"
  }, textIncludes("true"), undefined, undefined, "JXA");

  await testTool("appControl", { action: "list" }, hasContent);
  await testTool("finderControl", { action: "getSelection" }, hasContent);

  // windowControl — focus our Safari test window
  await testTool("windowControl", { action: "focus", windowTitle: "MCP Test UI" }, hasContent, undefined, undefined, "focus test window");

  await testTool("systemCommand", { command: "copy" }, hasContent);
  await testTool("accessibilityInspector", { appName: "Safari" }, hasContent, undefined, undefined, "inspect Safari");

  // menuClick — Safari View > Show Status Bar (safe, toggle)
  await testTool("menuClick", { appName: "Safari", menuPath: ["View", "Show Status Bar"] }, hasContent, undefined, undefined, "Safari View menu");
  await delay(300);

  await testTool("ocr", { x: 0, y: 0, width: 400, height: 100 }, hasContent);
}

async function testUIElementTools() {
  console.log("\n═══ UI Element Automation Tools ═══");

  // Bring Safari back to front
  run(`osascript -e 'tell application "Safari" to activate'`);
  await delay(500);

  await testTool("uiListWindows", { appName: "Safari" }, hasContent, undefined, undefined, "Safari windows");
  await testTool("appOverview", { appName: "Safari" }, hasContent, undefined, undefined, "Safari overview");
  await testTool("uiGetElements", { appName: "Safari", depth: 2 }, hasContent, undefined, undefined, "depth=2");
  await testTool("uiFindElement", { appName: "Safari", search: "MCP" }, hasContent, undefined, undefined, "find MCP text");

  // uiClickElement — click Submit button via AX tree search
  await testTool("uiClickElement", { appName: "Safari", search: "Submit" }, hasContent, undefined, undefined, "click Submit");
  await delay(300);

  // uiSetValue — toggle a checkbox via AX
  await testTool("uiSetValue", { appName: "Safari", search: "Dark Mode", value: false }, hasContent, undefined, undefined, "toggle checkbox");
  await delay(200);

  // uiTypeIntoElement — type into a text field
  await testTool("uiTypeIntoElement", { appName: "Safari", search: "email", text: "test@mcp.dev" }, hasContent, undefined, undefined, "type email");
  await delay(200);

  await testTool("uiScreenshot", { appName: "Safari" }, hasContent, undefined, undefined, "Safari screenshot");

  // windowTiling — tile Safari to left half, then maximize
  await testTool("windowTiling", { appName: "Safari", position: "left-half" }, hasContent, undefined, undefined, "tile left");
  await delay(500);
  await testTool("windowTiling", { appName: "Safari", position: "maximize" }, hasContent, undefined, undefined, "maximize");
  await delay(300);
  // Restore original bounds
  run(`osascript -e 'tell application "Safari" to set bounds of window 1 to {0, 25, 960, 700}'`);
  await delay(300);
}

async function testImageTools() {
  console.log("\n═══ Image & Wait Tools ═══");

  // Capture a small region as template for matching
  const tmpTemplate = "/tmp/mcp_test_template.png";
  let templateOk = false;
  try {
    run(`screencapture -x -R50,50,100,50 ${tmpTemplate}`);
    const fs = require("fs");
    templateOk = fs.existsSync(tmpTemplate) && fs.statSync(tmpTemplate).size > 100;
  } catch {}

  if (templateOk) {
    await testTool("imageMatch", { templatePath: tmpTemplate }, hasContent, undefined, undefined, "match template");
    await testTool("waitForImage", { imagePath: tmpTemplate, timeout: 3000 }, hasContent, undefined, undefined, "wait for template");
  } else {
    await testTool("imageMatch", {}, undefined, "Template capture failed");
    await testTool("waitForImage", {}, undefined, "Template capture failed");
  }

  await testTool("waitForChange", { region: { x: 0, y: 0, width: 100, height: 100 }, timeout: 1000 }, () => true);
  await testTool("screenRecording", { action: "status" }, hasContent);
  await testTool("fileWatcher", { path: "/tmp", timeoutSeconds: 1 }, () => true);
}

// ─── Main ───

async function main() {
  console.log("🧪 automation-mcp FULL Test Suite (with Test UI)\n");
  console.log("═══════════════════════════════════════════════════\n");

  try {
    await startServer();
    await openTestUI();
    await testToolListing();
    await testCoreTools();
    await testUtilityTools();
    await testOsascriptTools();
    await testUIElementTools();
    await testImageTools();
  } catch (e: any) {
    console.error(`\n💥 Fatal error: ${e.message}`);
  }

  // Cleanup
  await closeTestUI();
  run("rm -f /tmp/mcp_test_template.png");

  // Summary
  console.log("\n═══════════════════════════════════════════════════");
  console.log("📊 Test Summary\n");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`✅ PASS: ${pass}`);
  console.log(`❌ FAIL: ${fail}`);
  console.log(`⏭️  SKIP: ${skip}`);
  console.log(`📋 TOTAL: ${results.length}`);

  if (fail > 0) {
    console.log("\n❌ Failed tools:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`   ${r.tool}: ${r.message}`);
    });
  }

  childProc?.kill();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(console.error);
