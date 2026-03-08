#!/usr/bin/env bun
/**
 * MCP Tool Integration Test Harness
 * Tests all 55 tools via JSON-RPC over stdio
 * Uses raw process I/O with line-based JSON-RPC parsing
 */
import { spawn } from "child_process";
import * as readline from "readline";

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

async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    childProc = spawn("bun", ["run", "index.ts", "--stdio"], {
      cwd: "/Users/vai/.claude/mcp-servers/automation-mcp",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Read stderr for startup messages (non-blocking)
    childProc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        // Filter out startup noise
        for (const line of msg.split("\n")) {
          if (line.includes("Error") || line.includes("error")) {
            console.log(`   [stderr] ${line}`);
          }
        }
      }
    });

    // Parse stdout line by line for JSON-RPC
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
      } catch {
        // Not JSON, ignore
      }
    });

    // Wait a bit for server to start, then initialize
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
        // Send initialized notification
        sendNotification("notifications/initialized", {});
        console.log("✅ Server initialized successfully\n");
        resolve();
      } catch (e: any) {
        reject(e);
      }
    }, 2000);
  });
}

function sendRequest(method: string, params?: any): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    requestId++;
    const id = requestId;
    const req = { jsonrpc: "2.0", id, method, params };
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timeout for ${method} (id=${id})`));
    }, 30000);
    pendingRequests.set(id, { resolve, reject, timer });
    childProc.stdin!.write(JSON.stringify(req) + "\n");
  });
}

function sendNotification(method: string, params?: any): void {
  childProc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function callTool(name: string, args: Record<string, any> = {}): Promise<any> {
  return sendRequest("tools/call", { name, arguments: args });
}

async function testTool(
  name: string,
  args: Record<string, any> = {},
  validate?: (result: any) => boolean,
  skipReason?: string
): Promise<void> {
  if (skipReason) {
    results.push({ tool: name, status: "SKIP", message: skipReason, duration: 0 });
    console.log(`⏭️  ${name}: SKIP — ${skipReason}`);
    return;
  }

  const start = Date.now();
  try {
    const resp = await callTool(name, args);
    const duration = Date.now() - start;

    if (resp.error) {
      results.push({ tool: name, status: "FAIL", message: `RPC error: ${resp.error.message}`, duration });
      console.log(`❌ ${name}: FAIL (${duration}ms) — RPC: ${resp.error.message?.slice(0, 120)}`);
      return;
    }

    const content = resp.result?.content;
    if (content && Array.isArray(content)) {
      const textContent = content.find((c: any) => c.type === "text");
      const txt = textContent?.text ?? "";
      if (txt.startsWith("Error:") || txt.startsWith("Failed:")) {
        if (validate && validate(resp.result)) {
          results.push({ tool: name, status: "PASS", message: `OK (expected error) ${duration}ms`, duration });
          console.log(`✅ ${name}: PASS (${duration}ms) — expected error handled`);
          return;
        }
        results.push({ tool: name, status: "FAIL", message: `Tool error: ${txt.slice(0, 120)}`, duration });
        console.log(`❌ ${name}: FAIL (${duration}ms) — ${txt.slice(0, 120)}`);
        return;
      }
    }

    if (validate && !validate(resp.result)) {
      results.push({ tool: name, status: "FAIL", message: "Validation failed", duration });
      console.log(`❌ ${name}: FAIL (${duration}ms) — validation failed`);
      return;
    }

    results.push({ tool: name, status: "PASS", message: `OK ${duration}ms`, duration });
    console.log(`✅ ${name}: PASS (${duration}ms)`);
  } catch (e: any) {
    const duration = Date.now() - start;
    results.push({ tool: name, status: "FAIL", message: e.message?.slice(0, 120), duration });
    console.log(`❌ ${name}: FAIL (${duration}ms) — ${e.message?.slice(0, 120)}`);
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

// ─── Test Suites ───

async function testToolListing() {
  console.log("═══ Tool Listing ═══");
  const resp = await sendRequest("tools/list", {});
  const tools = resp.result?.tools ?? [];
  console.log(`📋 ${tools.length} tools registered`);
  if (tools.length !== 55) {
    console.log(`⚠️  Expected 55 tools, got ${tools.length}`);
  }
}

async function testCoreTools() {
  console.log("\n═══ Core Input/Output Tools ═══");
  await testTool("screenshot", {}, hasImageContent);
  await testTool("screenInfo", {}, hasContent);
  await testTool("mouseGetPosition", {}, hasContent);
  await testTool("colorAt", { x: 100, y: 100 }, hasContent);
  await testTool("mouseMove", { x: 100, y: 100 }, hasContent);
  await testTool("mouseClick", {}, undefined, "Skipping — would click");
  await testTool("mouseDoubleClick", {}, undefined, "Skipping — would double-click");
  await testTool("mouseDrag", {}, undefined, "Skipping — would drag");
  await testTool("mouseScroll", {}, undefined, "Skipping — would scroll");
  await testTool("mouseMovePath", {}, undefined, "Skipping — would move mouse");
  await testTool("mouseButtonControl", {}, undefined, "Skipping — would click");
  await testTool("type", {}, undefined, "Skipping — would type text");
  await testTool("keyControl", {}, undefined, "Skipping — would press keys");
  await testTool("sleep", { ms: 100 }, hasContent);
  await testTool("screenHighlight", {}, undefined, "Skipping — visual only");
}

async function testUtilityTools() {
  console.log("\n═══ Utility Tools ═══");
  await testTool("getWindows", {}, hasContent);
  await testTool("getActiveWindow", {}, hasContent);
  await testTool("clipboard", { action: "read" }, hasContent);
  await testTool("multiMonitor", {}, hasContent);
  await testTool("systemInfoExtended", {}, hasContent);
  await testTool("darkMode", { action: "get" }, hasContent);
  await testTool("notification", { title: "MCP Test", message: "Testing automation-mcp" }, hasContent);
  await testTool("sayText", {}, undefined, "Skipping — would play audio");
  await testTool("processManager", { action: "list" }, hasContent);
  await testTool("volumeControl", { action: "get" }, hasContent);
  await testTool("brightnessControl", { action: "get" }, hasContent);
  await testTool("dialog", {}, undefined, "Skipping — blocks on UI dialog");
  await testTool("portCheck", { action: "check", port: 80 }, hasContent);
  await testTool("spotlightSearch", { query: "README.md", maxResults: 3 }, hasContent);
  await testTool("pasteboardInfo", {}, hasContent);
  await testTool("networkDiagnostics", { action: "interfaces" }, hasContent);
  await testTool("defaultsControl", { action: "read", domain: "com.apple.dock", key: "autohide" }, hasContent);
  await testTool("quickLook", { filePath: "/Users/vai/.claude/mcp-servers/automation-mcp/README.md" }, hasContent);
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
  }, textIncludes("true"));
  await testTool("appControl", { action: "list" }, hasContent);
  await testTool("finderControl", { action: "getSelection" }, hasContent);
  await testTool("windowControl", { action: "focus", windowTitle: "Finder" }, hasContent);
  await testTool("systemCommand", { command: "copy" }, hasContent);
  await testTool("accessibilityInspector", { appName: "Finder" }, hasContent);
  await testTool("menuClick", {}, undefined, "Skipping — would click menu");
  await testTool("ocr", { x: 0, y: 0, width: 200, height: 50 }, hasContent);
}

async function testUIElementTools() {
  console.log("\n═══ UI Element Automation Tools ═══");
  await testTool("uiListWindows", { appName: "Finder" }, hasContent);
  await testTool("appOverview", { appName: "Finder" }, hasContent);
  await testTool("uiGetElements", { appName: "Finder", depth: 1 }, hasContent);
  await testTool("uiFindElement", { appName: "Finder", search: "sidebar" }, hasContent);
  await testTool("uiClickElement", {}, undefined, "Skipping — would click UI element");
  await testTool("uiSetValue", {}, undefined, "Skipping — would modify UI element");
  await testTool("uiTypeIntoElement", {}, undefined, "Skipping — would type into element");
  await testTool("uiScreenshot", { appName: "Finder" }, hasContent);
  await testTool("windowTiling", {}, undefined, "Skipping — would tile window");
}

async function testImageTools() {
  console.log("\n═══ Image & Wait Tools ═══");
  await testTool("imageMatch", {}, undefined, "Skipping — needs template image");
  await testTool("waitForImage", {}, undefined, "Skipping — needs template image");
  await testTool("waitForChange", { region: { x: 0, y: 0, width: 100, height: 100 }, timeout: 1000 }, () => true);
  await testTool("screenRecording", { action: "status" }, hasContent);
  await testTool("fileWatcher", { path: "/tmp", timeoutSeconds: 1 }, () => true);
}

// ─── Main ───

async function main() {
  console.log("🧪 automation-mcp Full Test Suite\n");
  console.log("═══════════════════════════════════\n");

  try {
    await startServer();
    await testToolListing();
    await testCoreTools();
    await testUtilityTools();
    await testOsascriptTools();
    await testUIElementTools();
    await testImageTools();
  } catch (e: any) {
    console.error(`\n💥 Fatal error: ${e.message}`);
  }

  // Summary
  console.log("\n═══════════════════════════════════");
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
