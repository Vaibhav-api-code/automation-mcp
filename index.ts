import { FastMCP, imageContent } from "fastmcp";
import { z } from "zod";
import * as child_process from "child_process";
import * as os from "os";
import * as path from "path";
import { screenInfo } from "./screenInfo";

// Import nutjs with error handling
let mouse: any,
  keyboard: any,
  Button: any,
  Key: any,
  Point: any,
  Region: any,
  Size: any,
  screen: any;
let getWindows: any, getActiveWindow: any;
let nutjsAvailable = false;

try {
  const nutjs = require("./nutjs/nut.js/core/nut.js/dist/index.js");
  ({
    mouse,
    keyboard,
    Button,
    Key,
    Point,
    Region,
    Size,
    screen,
    getWindows,
    getActiveWindow,
  } = nutjs);
  nutjsAvailable = true;
  console.log("✅ nutjs loaded successfully");
} catch (error: any) {
  console.warn("⚠️ nutjs not fully available:", error.message);
  console.log(
    "📋 Basic screenshot functionality will still work via macOS screencapture"
  );
}

// macOS permissions handling
let macPermissions: any;
let permissionsAvailable = false;

try {
  macPermissions = require("node-mac-permissions");
  permissionsAvailable = true;

  if (macPermissions.getAuthStatus("accessibility") !== "authorized") {
    macPermissions.askForAccessibilityAccess();
    console.log(
      '⚠️ Please enable Accessibility ("Control your Mac") for this app in System Settings > Privacy & Security > Accessibility.'
    );
  }
  if (macPermissions.getAuthStatus("screen") !== "authorized") {
    macPermissions.askForScreenCaptureAccess();
    console.log(
      "⚠️ Please enable Screen Recording for this app in System Settings > Privacy & Security > Screen Recording."
    );
  }
} catch (error: any) {
  console.warn("⚠️ macOS permissions module not available:", error.message);
}

// Suppress FastMCP console output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
  // Only allow our custom logs (those that start with emoji)
  if (args[0] && typeof args[0] === "string" && /^[🚀📋🔐⚠️✅]/.test(args[0])) {
    originalConsoleLog(...args);
  }
};
console.error = (...args: any[]) => {
  // Suppress only FastMCP internal errors; pass through all others
  if (args[0] && typeof args[0] === "string" && args[0].includes("FastMCP")) return;
  originalConsoleError(...args);
};
console.warn = (...args: any[]) => {
  // Suppress only FastMCP internal warnings; pass through all others
  if (args[0] && typeof args[0] === "string" && args[0].includes("FastMCP")) return;
  originalConsoleWarn(...args);
};

const server = new FastMCP({
  name: "Local Automation MCP",
  version: "1.0.0",
});

// Helper function to check nutjs availability
const requireNutjs = () => {
  if (!nutjsAvailable) {
    throw new Error(
      "nutjs functionality not available. Please ensure all dependencies are properly installed."
    );
  }
};

// ============== MOUSE TOOLS ==============

// Tool 1: Mouse Click Simulation
server.addTool({
  name: "mouseClick",
  description: "Simulate a mouse click at the given screen coordinates.",
  parameters: z.object({
    x: z.number().describe("Horizontal screen coordinate (pixels)"),
    y: z.number().describe("Vertical screen coordinate (pixels)"),
    button: z
      .enum(["left", "right", "middle"])
      .default("left")
      .describe("Mouse button to click (default left)"),
  }),
  execute: async ({ x, y, button }) => {
    requireNutjs();
    // Move mouse to (x,y) and perform the click
    await mouse.setPosition(new Point(x, y));
    const btn =
      button === "left"
        ? Button.LEFT
        : button === "right"
        ? Button.RIGHT
        : Button.MIDDLE;
    await mouse.click(btn);
    return `Mouse ${button}-click at (${x}, ${y}) completed.`;
  },
});

// Tool 2: Mouse Double Click
server.addTool({
  name: "mouseDoubleClick",
  description: "Simulate a mouse double-click at the given screen coordinates.",
  parameters: z.object({
    x: z.number().describe("Horizontal screen coordinate (pixels)"),
    y: z.number().describe("Vertical screen coordinate (pixels)"),
    button: z
      .enum(["left", "right", "middle"])
      .default("left")
      .describe("Mouse button to double-click (default left)"),
  }),
  execute: async ({ x, y, button }) => {
    requireNutjs();
    await mouse.setPosition(new Point(x, y));
    const btn =
      button === "left"
        ? Button.LEFT
        : button === "right"
        ? Button.RIGHT
        : Button.MIDDLE;
    await mouse.doubleClick(btn);
    return `Mouse double-${button}-click at (${x}, ${y}) completed.`;
  },
});

// Tool 3: Mouse Move
server.addTool({
  name: "mouseMove",
  description: "Move the mouse to specific coordinates.",
  parameters: z.object({
    x: z.number().describe("Horizontal screen coordinate (pixels)"),
    y: z.number().describe("Vertical screen coordinate (pixels)"),
  }),
  execute: async ({ x, y }) => {
    requireNutjs();
    await mouse.setPosition(new Point(x, y));
    return `Mouse moved to (${x}, ${y}).`;
  },
});

// Tool 4: Mouse Get Position
server.addTool({
  name: "mouseGetPosition",
  description: "Get the current mouse cursor position.",
  parameters: z.object({}),
  execute: async () => {
    requireNutjs();
    const position = await mouse.getPosition();
    return `Current mouse position: (${position.x}, ${position.y})`;
  },
});

// Tool 5: Mouse Scroll
server.addTool({
  name: "mouseScroll",
  description: "Scroll the mouse wheel in a specified direction.",
  parameters: z.object({
    direction: z
      .enum(["up", "down", "left", "right"])
      .describe("Direction to scroll"),
    amount: z
      .number()
      .default(3)
      .describe("Number of scroll steps (default 3)"),
  }),
  execute: async ({ direction, amount }) => {
    requireNutjs();
    switch (direction) {
      case "up":
        await mouse.scrollUp(amount);
        break;
      case "down":
        await mouse.scrollDown(amount);
        break;
      case "left":
        await mouse.scrollLeft(amount);
        break;
      case "right":
        await mouse.scrollRight(amount);
        break;
    }
    return `Scrolled ${direction} ${amount} steps.`;
  },
});

// Tool 6: Mouse Drag
server.addTool({
  name: "mouseDrag",
  description: "Drag the mouse from current position to target coordinates.",
  parameters: z.object({
    x: z.number().describe("Target horizontal coordinate (pixels)"),
    y: z.number().describe("Target vertical coordinate (pixels)"),
  }),
  execute: async ({ x, y }) => {
    requireNutjs();
    const currentPos = await mouse.getPosition();
    await mouse.drag([new Point(x, y)]);
    return `Dragged mouse from (${currentPos.x}, ${currentPos.y}) to (${x}, ${y}).`;
  },
});

// Tool 7: Mouse Press/Release Button
server.addTool({
  name: "mouseButtonControl",
  description: "Press or release a mouse button without clicking.",
  parameters: z.object({
    action: z.enum(["press", "release"]).describe("Action to perform"),
    button: z
      .enum(["left", "right", "middle"])
      .default("left")
      .describe("Mouse button to control (default left)"),
  }),
  execute: async ({ action, button }) => {
    requireNutjs();
    const btn =
      button === "left"
        ? Button.LEFT
        : button === "right"
        ? Button.RIGHT
        : Button.MIDDLE;

    if (action === "press") {
      await mouse.pressButton(btn);
      return `${button} mouse button pressed.`;
    } else {
      await mouse.releaseButton(btn);
      return `${button} mouse button released.`;
    }
  },
});

// ============== KEYBOARD TOOLS ==============

// Tool 8: Enhanced Keyboard Typing
server.addTool({
  name: "type",
  description:
    "Simulate typing text or pressing key combinations. Provide either 'text' to type literal text, or 'keys' as comma-separated key names for key combinations.",
  parameters: z.object({
    text: z.string().optional().describe("Literal text to type (optional)"),
    keys: z
      .string()
      .optional()
      .describe(
        "Comma-separated key names to press simultaneously (optional, e.g. 'LeftControl,C')"
      ),
  }),
  execute: async ({ text, keys }) => {
    requireNutjs();
    if (keys && keys.length > 0) {
      // Parse comma-separated key names
      const keyNames = keys.split(",").map((k) => k.trim());
      // Map each key name to nut.js Key constant
      const keyConsts: any[] = keyNames.map((name) => {
        const keyName = name === "Command" ? "LeftSuper" : name;
        const keyConst = (Key as any)[keyName];
        if (!keyConst) throw new Error(`Unknown key: ${name}`);
        return keyConst;
      });
      // Press and release the key combination
      await keyboard.pressKey(...keyConsts);
      await keyboard.releaseKey(...keyConsts);
      return `Pressed key combination [${keyNames.join(" + ")}].`;
    }
    if (text !== undefined) {
      await keyboard.type(text);
      return `Typed text: "${text}"`;
    }
    throw new Error(
      "Provide either 'text' to type or 'keys' for key combination."
    );
  },
});

// Tool 9: Key Press/Release Control
server.addTool({
  name: "keyControl",
  description: "Press or release specific keys for advanced key combinations.",
  parameters: z.object({
    action: z.enum(["press", "release"]).describe("Action to perform"),
    keys: z
      .string()
      .describe(
        "Comma-separated key names to control (e.g. 'LeftControl,LeftShift')"
      ),
  }),
  execute: async ({ action, keys }) => {
    requireNutjs();
    const keyNames = keys.split(",").map((k) => k.trim());
    const keyConsts: any[] = keyNames.map((name) => {
      const keyName = name === "Command" ? "LeftSuper" : name;
      const keyConst = (Key as any)[keyName];
      if (!keyConst) throw new Error(`Unknown key: ${name}`);
      return keyConst;
    });

    if (action === "press") {
      await keyboard.pressKey(...keyConsts);
      return `Pressed keys: [${keyNames.join(", ")}]`;
    } else {
      await keyboard.releaseKey(...keyConsts);
      return `Released keys: [${keyNames.join(", ")}]`;
    }
  },
});

// ============== SCREEN TOOLS ==============

// Tool 10: Enhanced Screenshot Capture
server.addTool({
  name: "screenshot",
  description:
    "Capture a screenshot (full screen, region, or window). Default to full screen if no preference. This will also provide information about the user's screen in order to correctly position mouse clicks and keyboard inputs.",
  parameters: z.object({
    mode: z
      .enum(["full", "region", "window"])
      .default("full")
      .describe("Capture mode: full (entire screen), region, or window"),
    regionX: z
      .number()
      .optional()
      .describe("Region X coordinate (for region mode)"),
    regionY: z
      .number()
      .optional()
      .describe("Region Y coordinate (for region mode)"),
    regionWidth: z
      .number()
      .optional()
      .describe("Region width (for region mode)"),
    regionHeight: z
      .number()
      .optional()
      .describe("Region height (for region mode)"),
    windowName: z.string().optional().describe("Window title (if mode=window)"),
    windowId: z.number().optional().describe("Window ID (if mode=window)"),
  }),
  execute: async ({
    mode,
    regionX,
    regionY,
    regionWidth,
    regionHeight,
    windowName,
    windowId,
  }) => {
    try {
      const filePath = path.join(
        os.tmpdir(),
        `mcp_screenshot_${Date.now()}.png`
      );

      // Perform the OS-level screencapture
      if (mode === "full") {
        child_process.execFileSync("screencapture", ["-x", "-D1", filePath]);
      } else if (mode === "region") {
        if (
          regionX === undefined ||
          regionY === undefined ||
          regionWidth === undefined ||
          regionHeight === undefined
        ) {
          throw new Error(
            "Region mode requires regionX, regionY, regionWidth, and regionHeight parameters"
          );
        }
        child_process.execFileSync("screencapture", [
          "-x",
          `-R${regionX},${regionY},${regionWidth},${regionHeight}`,
          filePath,
        ]);
      } else if (mode === "window") {
        let targetId = windowId;
        if (!targetId && windowName) {
          const { openWindows } = require("get-windows");
          const allWindows = await openWindows();
          const targetWin = allWindows.find(
            (w: any) => w.title && w.title.includes(windowName)
          );
          if (!targetWin)
            throw new Error(
              `Window containing title "${windowName}" not found`
            );
          targetId = targetWin.id;
        }
        if (!targetId)
          throw new Error(
            "Could not determine target window ID for screenshot."
          );
        child_process.execFileSync("screencapture", ["-x", `-l${targetId}`, filePath]);
      }

      if (!require("fs").existsSync(filePath)) {
        throw new Error(`Screenshot file was not created at ${filePath}`);
      }

      try {
        return await imageContent({ path: filePath });
      } finally {
        // Clean up temp file after reading
        try {
          require("fs").unlinkSync(filePath);
        } catch (_) {
          // Best-effort cleanup
        }
      }
    } catch (error: any) {
      throw new Error(`Screenshot failed: ${error?.message || error}`);
    }
  },
});

// Tool 11: Screen Information
server.addTool({
  name: "screenInfo",
  description: "Get screen dimensions and information.",
  parameters: z.object({}),
  execute: async () => {
    return await screenInfo(nutjsAvailable);
  },
});

// Tool 12: Screen Highlight
server.addTool({
  name: "screenHighlight",
  description: "Highlight a region on the screen for visual feedback.",
  parameters: z.object({
    x: z.number().describe("Left coordinate of region"),
    y: z.number().describe("Top coordinate of region"),
    width: z.number().describe("Width of region"),
    height: z.number().describe("Height of region"),
  }),
  execute: async ({ x, y, width, height }) => {
    requireNutjs();
    const region = new Region(x, y, width, height);
    await screen.highlight(region);
    return `Highlighted region at (${x}, ${y}) with size ${width}x${height}`;
  },
});

// Tool 13: Color at Point
server.addTool({
  name: "colorAt",
  description: "Get the color of a pixel at specific screen coordinates.",
  parameters: z.object({
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  }),
  execute: async ({ x, y }) => {
    requireNutjs();
    const color = await screen.colorAt(new Point(x, y));
    return `Color at (${x}, ${y}): R=${color.R}, G=${color.G}, B=${color.B}, A=${color.A}`;
  },
});

// ============== WINDOW MANAGEMENT TOOLS ==============

// Tool 14: Get All Windows
server.addTool({
  name: "getWindows",
  description: "Get information about all open windows.",
  parameters: z.object({}),
  execute: async () => {
    if (nutjsAvailable) {
      try {
        const windows = await getWindows();
        const windowInfo = await Promise.all(
          windows.map(async (win: any, index: number) => {
            const title = await win.getTitle();
            const region = await win.getRegion();
            return `${index + 1}. "${title}" - Position: (${region.left}, ${
              region.top
            }), Size: ${region.width}x${region.height}`;
          })
        );
        return `Open windows:\n${windowInfo.join("\n")}`;
      } catch (e) {
        console.warn("nutjs getWindows failed, trying fallback");
      }
    }

    // Fallback to get-windows
    try {
      const { openWindows } = require("get-windows");
      const allWindows = await openWindows();
      const windowInfo = allWindows.map((win: any, index: number) => {
        return `${index + 1}. "${win.title}" - ID: ${win.id}`;
      });
      return `Open windows:\n${windowInfo.join("\n")}`;
    } catch (e) {
      throw new Error(`Failed to get windows: ${e}`);
    }
  },
});

// Tool 15: Get Active Window
server.addTool({
  name: "getActiveWindow",
  description: "Get information about the currently active window.",
  parameters: z.object({}),
  execute: async () => {
    if (nutjsAvailable) {
      try {
        const activeWindow = await getActiveWindow();
        const title = await activeWindow.getTitle();
        const region = await activeWindow.getRegion();
        return `Active window: "${title}" - Position: (${region.left}, ${region.top}), Size: ${region.width}x${region.height}`;
      } catch (e) {
        console.warn("nutjs getActiveWindow failed, trying fallback");
      }
    }

    // Fallback method
    try {
      const { openWindows } = require("get-windows");
      const allWindows = await openWindows();
      const activeWindow = allWindows.find((w: any) => w.active);
      if (activeWindow) {
        return `Active window: "${activeWindow.title}" - ID: ${activeWindow.id}`;
      }
    } catch (e) {
      // Another fallback using AppleScript
      try {
        const output = child_process
          .execFileSync("osascript", [
            "-e",
            'tell application "System Events" to get name of first application process whose frontmost is true',
          ], { encoding: "utf-8", timeout: 5000 })
          .trim();
        return `Active window: "${output}"`;
      } catch (e2) {
        throw new Error(`Failed to get active window: ${e2}`);
      }
    }

    return "Could not determine active window";
  },
});

// Tool 16: Window Control
server.addTool({
  name: "windowControl",
  description: "Control a window (focus, move, resize, minimize, restore).",
  parameters: z.object({
    action: z
      .enum(["focus", "move", "resize", "minimize", "restore"])
      .describe("Action to perform"),
    windowTitle: z
      .string()
      .optional()
      .describe("Window title to target (uses active window if not provided)"),
    x: z.number().optional().describe("X coordinate for move action"),
    y: z.number().optional().describe("Y coordinate for move action"),
    width: z.number().optional().describe("Width for resize action"),
    height: z.number().optional().describe("Height for resize action"),
  }),
  execute: async ({ action, windowTitle, x, y, width, height }) => {
    if (!nutjsAvailable) {
      // Limited functionality without nutjs
      if (action === "focus" && windowTitle) {
        try {
          const safeTitle = escapeForAppleScript(windowTitle);
          child_process.execFileSync(
            "osascript",
            ["-e", `tell application "${safeTitle}" to activate`],
            { encoding: "utf-8", timeout: 5000 }
          );
          return `Attempted to focus application: "${windowTitle}"`;
        } catch (e) {
          throw new Error(`Failed to focus application: ${e}`);
        }
      } else {
        throw new Error("Window control requires nutjs to be fully loaded");
      }
    }

    let targetWindow: any;

    if (windowTitle) {
      const windows = await getWindows();
      targetWindow = await Promise.all(
        windows.map(async (win: any) => ({
          window: win,
          title: await win.getTitle(),
        }))
      ).then(
        (windowsWithTitles) =>
          windowsWithTitles.find((w) => w.title.includes(windowTitle))?.window
      );

      if (!targetWindow) {
        throw new Error(
          `Window with title containing "${windowTitle}" not found`
        );
      }
    } else {
      targetWindow = await getActiveWindow();
    }

    const windowName = await targetWindow.getTitle();

    switch (action) {
      case "focus":
        await targetWindow.focus();
        return `Focused window: "${windowName}"`;

      case "move":
        if (x === undefined || y === undefined) {
          throw new Error("Move action requires x and y coordinates");
        }
        await targetWindow.move(new Point(x, y));
        return `Moved window "${windowName}" to (${x}, ${y})`;

      case "resize":
        if (width === undefined || height === undefined) {
          throw new Error("Resize action requires width and height");
        }
        await targetWindow.resize(new Size(width, height));
        return `Resized window "${windowName}" to ${width}x${height}`;

      case "minimize":
        await targetWindow.minimize();
        return `Minimized window: "${windowName}"`;

      case "restore":
        await targetWindow.restore();
        return `Restored window: "${windowName}"`;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
});

// ============== ADVANCED AUTOMATION TOOLS ==============

// Tool 17: Wait and Find on Screen
server.addTool({
  name: "waitForImage",
  description: "Wait for an image to appear on screen and return its location.",
  parameters: z.object({
    imagePath: z.string().describe("Path to the template image file"),
    timeoutMs: z.number().default(5000).describe("Timeout in milliseconds"),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .default(0.8)
      .describe("Match confidence (0-1)"),
  }),
  execute: async ({ imagePath, timeoutMs, confidence }) => {
    return `Image matching functionality requires additional setup. Would wait for image "${imagePath}" with confidence ${confidence} for ${timeoutMs}ms.`;
  },
});

// Tool 17b: Image Match (Template Matching)
server.addTool({
  name: "imageMatch",
  description:
    "Finds a template image on the screen. Captures a screenshot and searches for the template within it. Returns the center coordinates and confidence of the best match. Optionally restrict search to a specific screen region.",
  parameters: z.object({
    templatePath: z
      .string()
      .describe("Path to the template image file to search for"),
    region: z
      .object({
        x: z.number().min(0).describe("X coordinate"),
        y: z.number().min(0).describe("Y coordinate"),
        width: z.number().min(1).describe("Width"),
        height: z.number().min(1).describe("Height"),
      })
      .optional()
      .describe("Optional screen region to search within"),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .default(0.8)
      .describe("Minimum match confidence (0.0-1.0)"),
  }),
  execute: async ({ templatePath, region, threshold }) => {
    const { execFileSync } = child_process;
    const fs = require("fs");
    const { Jimp } = require("jimp");

    // Manual intToRGBA - compatible with all Jimp versions (v1.x moved the export)
    const intToRGBA = (i: number) => ({
      r: (i >> 24) & 0xff,
      g: (i >> 16) & 0xff,
      b: (i >> 8) & 0xff,
      a: i & 0xff,
    });

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // Capture screen region
    const tmpScreen = path.join(
      os.tmpdir(),
      `imgmatch_screen_${Date.now()}.png`
    );
    try {
      const captureArgs = ["-x"];
      if (region) {
        captureArgs.push(
          "-R",
          `${region.x},${region.y},${region.width},${region.height}`
        );
      }
      captureArgs.push(tmpScreen);
      execFileSync("screencapture", captureArgs, { timeout: 10000 });
    } catch (error: any) {
      try {
        if (fs.existsSync(tmpScreen)) {
          fs.unlinkSync(tmpScreen);
        }
      } catch {
        // Ignore cleanup errors to preserve original failure context
      }
      throw new Error(`Failed to capture screen: ${error.message}`);
    }

    try {
      const screenImg = await Jimp.read(tmpScreen);
      const templateImg = await Jimp.read(templatePath);

      const sw = screenImg.bitmap.width;
      const sh = screenImg.bitmap.height;
      const tw = templateImg.bitmap.width;
      const th = templateImg.bitmap.height;

      if (tw > sw || th > sh) {
        throw new Error(
          `Template (${tw}x${th}) is larger than search area (${sw}x${sh}).`
        );
      }

      // Sliding window template matching (coarse-to-fine)
      let bestScore = -1;
      let bestX = 0;
      let bestY = 0;
      const stepX = Math.max(1, Math.floor(tw / 8));
      const stepY = Math.max(1, Math.floor(th / 8));

      const compareAt = (sx: number, sy: number, sampleStep: number): number => {
        let matchCount = 0;
        let totalSamples = 0;
        for (let ty = 0; ty < th; ty += sampleStep) {
          for (let tx = 0; tx < tw; tx += sampleStep) {
            const sc = screenImg.getPixelColor(sx + tx, sy + ty);
            const tc = templateImg.getPixelColor(tx, ty);
            totalSamples++;
            const sr = intToRGBA(sc);
            const tr = intToRGBA(tc);
            const diff =
              Math.abs(sr.r - tr.r) +
              Math.abs(sr.g - tr.g) +
              Math.abs(sr.b - tr.b);
            if (diff < 30) matchCount++;
          }
        }
        return totalSamples > 0 ? matchCount / totalSamples : 0;
      };

      // Coarse pass
      const coarseSampleStep = Math.max(1, Math.floor(Math.min(tw, th) / 10));
      for (let sy = 0; sy <= sh - th; sy += stepY) {
        for (let sx = 0; sx <= sw - tw; sx += stepX) {
          const score = compareAt(sx, sy, coarseSampleStep);
          if (score > bestScore) {
            bestScore = score;
            bestX = sx;
            bestY = sy;
          }
        }
      }

      // Fine pass around best coarse location (wider range, lower threshold)
      if (bestScore > 0.15) {
        const fineRange = Math.max(stepX, stepY) * 3;
        const fineStartX = Math.max(0, bestX - fineRange);
        const fineStartY = Math.max(0, bestY - fineRange);
        const fineEndX = Math.min(sw - tw, bestX + fineRange);
        const fineEndY = Math.min(sh - th, bestY + fineRange);
        const fineSampleStep = Math.max(
          1,
          Math.floor(Math.min(tw, th) / 16)
        );

        for (let sy = fineStartY; sy <= fineEndY; sy++) {
          for (let sx = fineStartX; sx <= fineEndX; sx++) {
            const score = compareAt(sx, sy, fineSampleStep);
            if (score > bestScore) {
              bestScore = score;
              bestX = sx;
              bestY = sy;
            }
          }
        }
      }

      const offsetX = region ? region.x : 0;
      const offsetY = region ? region.y : 0;

      if (bestScore >= threshold) {
        const cx = offsetX + bestX + Math.floor(tw / 2);
        const cy = offsetY + bestY + Math.floor(th / 2);
        return `Match found at (${cx}, ${cy}) with confidence ${bestScore.toFixed(3)}. Template size: ${tw}x${th}.`;
      }

      return `No match found (best confidence: ${bestScore.toFixed(3)}, threshold: ${threshold}). Template: ${tw}x${th}.`;
    } finally {
      try {
        require("fs").unlinkSync(tmpScreen);
      } catch {}
    }
  },
});

// Tool 18: Sleep/Delay
server.addTool({
  name: "sleep",
  description: "Pause execution for a specified amount of time.",
  parameters: z.object({
    ms: z.number().describe("Time to sleep in milliseconds"),
  }),
  execute: async ({ ms }) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return `Slept for ${ms} milliseconds`;
  },
});

// Tool 19: Complex Mouse Path Movement
server.addTool({
  name: "mouseMovePath",
  description: "Move mouse along a path of coordinates with smooth animation.",
  parameters: z.object({
    path: z
      .array(z.number())
      .describe(
        "Array of coordinates to move through (alternating x,y values: [x1,y1,x2,y2,...])"
      ),
  }),
  execute: async ({ path }) => {
    requireNutjs();

    // Validate that we have an even number of coordinates
    if (path.length % 2 !== 0) {
      throw new Error(
        "Path array must contain an even number of values (alternating x,y coordinates)"
      );
    }

    // Convert flat array to Point objects
    const points: any[] = [];
    for (let i = 0; i < path.length; i += 2) {
      points.push(new Point(path[i], path[i + 1]));
    }

    await mouse.move(points);
    return `Mouse moved along path with ${points.length} points`;
  },
});

// Tool 20: System Key Combinations
server.addTool({
  name: "systemCommand",
  description:
    "Execute common system key combinations (copy, paste, undo, etc.).",
  parameters: z.object({
    command: z
      .enum([
        "copy",
        "paste",
        "cut",
        "undo",
        "redo",
        "selectAll",
        "save",
        "quit",
        "minimize",
        "switchApp",
        "newTab",
        "closeTab",
      ])
      .describe("System command to execute"),
  }),
  execute: async ({ command }) => {
    if (nutjsAvailable) {
      const isMac = process.platform === "darwin";
      const cmdKey = isMac ? Key.LeftSuper : Key.LeftControl;

      switch (command) {
        case "copy":
          await keyboard.pressKey(cmdKey, Key.C);
          await keyboard.releaseKey(cmdKey, Key.C);
          return "Executed copy command";

        case "paste":
          await keyboard.pressKey(cmdKey, Key.V);
          await keyboard.releaseKey(cmdKey, Key.V);
          return "Executed paste command";

        case "cut":
          await keyboard.pressKey(cmdKey, Key.X);
          await keyboard.releaseKey(cmdKey, Key.X);
          return "Executed cut command";

        case "undo":
          await keyboard.pressKey(cmdKey, Key.Z);
          await keyboard.releaseKey(cmdKey, Key.Z);
          return "Executed undo command";

        case "redo":
          if (isMac) {
            await keyboard.pressKey(cmdKey, Key.LeftShift, Key.Z);
            await keyboard.releaseKey(cmdKey, Key.LeftShift, Key.Z);
          } else {
            await keyboard.pressKey(cmdKey, Key.Y);
            await keyboard.releaseKey(cmdKey, Key.Y);
          }
          return "Executed redo command";

        case "selectAll":
          await keyboard.pressKey(cmdKey, Key.A);
          await keyboard.releaseKey(cmdKey, Key.A);
          return "Executed select all command";

        case "save":
          await keyboard.pressKey(cmdKey, Key.S);
          await keyboard.releaseKey(cmdKey, Key.S);
          return "Executed save command";

        case "quit":
          if (isMac) {
            await keyboard.pressKey(cmdKey, Key.Q);
            await keyboard.releaseKey(cmdKey, Key.Q);
          } else {
            await keyboard.pressKey(Key.LeftAlt, Key.F4);
            await keyboard.releaseKey(Key.LeftAlt, Key.F4);
          }
          return "Executed quit command";

        case "minimize":
          if (isMac) {
            await keyboard.pressKey(cmdKey, Key.M);
            await keyboard.releaseKey(cmdKey, Key.M);
          } else {
            await keyboard.pressKey(Key.LeftSuper, Key.Down);
            await keyboard.releaseKey(Key.LeftSuper, Key.Down);
          }
          return "Executed minimize command";

        case "switchApp":
          if (isMac) {
            await keyboard.pressKey(cmdKey, Key.Tab);
            await keyboard.releaseKey(cmdKey, Key.Tab);
          } else {
            await keyboard.pressKey(Key.LeftAlt, Key.Tab);
            await keyboard.releaseKey(Key.LeftAlt, Key.Tab);
          }
          return "Executed switch app command";

        case "newTab":
          await keyboard.pressKey(cmdKey, Key.T);
          await keyboard.releaseKey(cmdKey, Key.T);
          return "Executed new tab command";

        case "closeTab":
          await keyboard.pressKey(cmdKey, Key.W);
          await keyboard.releaseKey(cmdKey, Key.W);
          return "Executed close tab command";

        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } else {
      // Fallback using AppleScript for macOS
      const commandMap: { [key: string]: string } = {
        copy: 'keystroke "c" using command down',
        paste: 'keystroke "v" using command down',
        cut: 'keystroke "x" using command down',
        undo: 'keystroke "z" using command down',
        redo: 'keystroke "z" using {command down, shift down}',
        selectAll: 'keystroke "a" using command down',
        save: 'keystroke "s" using command down',
        quit: 'keystroke "q" using command down',
        minimize: 'keystroke "m" using command down',
        switchApp: "keystroke tab using command down",
        newTab: 'keystroke "t" using command down',
        closeTab: 'keystroke "w" using command down',
      };

      const script = commandMap[command];
      if (script) {
        child_process.execFileSync("osascript", [
          "-e",
          `tell application "System Events" to ${script}`,
        ], { encoding: "utf-8", timeout: 5000 });
        return `Executed ${command} command using AppleScript`;
      } else {
        throw new Error(`Unknown command: ${command}`);
      }
    }
  },
});

// ============== ENHANCED AUTOMATION TOOLS ==============

// Tool 21: Process Manager
server.addTool({
  name: "processManager",
  description:
    "Lists running processes or terminates a process by name or PID. Use action='list' to see processes (optionally filter by name), action='kill' to terminate.",
  parameters: z.object({
    action: z.enum(["list", "kill"]).describe("Action to perform"),
    name: z
      .string()
      .optional()
      .describe("Process name to filter/kill"),
    pid: z.number().min(1).optional().describe("Process ID to kill (must be positive)"),
    signal: z
      .enum(["TERM", "KILL"])
      .default("TERM")
      .describe("Signal to send: TERM (graceful shutdown) or KILL (force terminate)"),
  }),
  execute: async ({ action, name, pid, signal }) => {
    const { execFileSync } = child_process;

    if (action === "list") {
      try {
        const output = execFileSync("ps", ["aux"], {
          encoding: "utf-8",
          timeout: 10000,
        });
        const lines = output.trim().split("\n");
        if (name) {
          const filtered = lines.filter(
            (line: string, i: number) =>
              i === 0 || line.toLowerCase().includes(name.toLowerCase())
          );
          return filtered.length > 1
            ? `Processes matching "${name}":\n${filtered.join("\n")}`
            : `No processes found matching "${name}".`;
        }
        // Return first 30 lines (header + 29 processes) by default
        return `Running processes (first 30 entries from ps aux):\n${lines.slice(0, 31).join("\n")}`;
      } catch (error: any) {
        throw new Error(`Failed to list processes: ${error.message}`);
      }
    }

    if (action === "kill") {
      if (!pid && !name) {
        throw new Error(
          "Either pid or name must be provided for kill action."
        );
      }

      try {
        const sigFlag = signal === "KILL" ? "-9" : "-15";
        if (pid) {
          execFileSync("kill", [sigFlag, String(pid)], {
            encoding: "utf-8",
            timeout: 5000,
          });
          return `Sent ${signal} signal to process ${pid}.`;
        }
        // Kill by name using pkill with -x for exact match (no regex, no escaping needed)
        execFileSync("pkill", [sigFlag, "-x", name!], {
          encoding: "utf-8",
          timeout: 5000,
        });
        return `Sent ${signal} signal to processes matching "${name}".`;
      } catch (error: any) {
        if (error.status === 1) {
          return `No processes found matching the criteria.`;
        }
        throw new Error(`Failed to kill process: ${error.message}`);
      }
    }

    throw new Error('Invalid action. Use "list" or "kill".');
  },
});

// Tool 22: macOS Notification
server.addTool({
  name: "notification",
  description:
    "Sends a macOS notification to the Notification Center with a title and message. Optionally includes a subtitle and sound.",
  parameters: z.object({
    title: z.string().describe("Notification title"),
    message: z.string().describe("Notification message body"),
    subtitle: z.string().optional().describe("Optional subtitle"),
    sound: z
      .string()
      .optional()
      .describe(
        "Optional sound name (e.g., 'default', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink'); omit or use 'none' for no sound"
      ),
  }),
  execute: async ({ title, message, subtitle, sound }) => {
    const { execFileSync } = child_process;

    // Build AppleScript - escape backslashes, quotes, and control characters
    const escapeAppleScript = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
    const escTitle = escapeAppleScript(title);
    const escMsg = escapeAppleScript(message);

    let script = `display notification "${escMsg}" with title "${escTitle}"`;
    if (subtitle) {
      const escSub = escapeAppleScript(subtitle);
      script += ` subtitle "${escSub}"`;
    }
    if (sound && sound !== "none") {
      const escSound = escapeAppleScript(sound);
      script += ` sound name "${escSound}"`;
    }

    try {
      execFileSync("osascript", ["-e", script], {
        encoding: "utf-8",
        timeout: 5000,
      });
      return `Notification sent: "${title}" - ${message}`;
    } catch (error: any) {
      throw new Error(`Failed to send notification: ${error.message}`);
    }
  },
});

// Tool 23: OCR (Optical Character Recognition)
server.addTool({
  name: "ocr",
  description:
    "Reads text from a screen region or image file using macOS Vision framework OCR. Specify a region {x, y, width, height} to capture and read from screen, or provide an imagePath to read from a file. If both are provided, imagePath takes precedence.",
  parameters: z.object({
    region: z
      .object({
        x: z.number().min(0).describe("X coordinate"),
        y: z.number().min(0).describe("Y coordinate"),
        width: z.number().min(1).describe("Width of region"),
        height: z.number().min(1).describe("Height of region"),
      })
      .optional()
      .describe("Screen region to capture and OCR"),
    imagePath: z
      .string()
      .optional()
      .describe("Path to an image file to OCR"),
  }),
  execute: async ({ region, imagePath }) => {
    const { execFileSync } = child_process;
    const fs = require("fs");

    let targetPath = imagePath;
    let tempFile: string | null = null;

    // If region specified, capture screenshot of that region
    if (region && !imagePath) {
      tempFile = path.join(os.tmpdir(), `ocr_capture_${Date.now()}.png`);
      try {
        execFileSync(
          "screencapture",
          [
            "-x",
            "-R",
            `${region.x},${region.y},${region.width},${region.height}`,
            tempFile,
          ],
          { timeout: 10000 }
        );
        targetPath = tempFile;
      } catch (error: any) {
        throw new Error(
          `Failed to capture screen region: ${error.message}`
        );
      }
    }

    if (!targetPath) {
      throw new Error("Either region or imagePath must be provided.");
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Image file not found: ${targetPath}`);
    }

    // Use macOS Vision framework via Swift subprocess
    // Pass path as CLI argument to avoid string interpolation injection
    const swiftScript = `
import Vision
import AppKit

let filePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: filePath)
guard let image = NSImage(contentsOf: url),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("ERROR: Could not load image")
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

guard let observations = request.results else {
    print("")
    exit(0)
}

for observation in observations {
    if let candidate = observation.topCandidates(1).first {
        print(candidate.string)
    }
}
`;

    try {
      const result = execFileSync("swift", ["-e", swiftScript, targetPath], {
        encoding: "utf-8",
        timeout: 30000,
      });

      // Clean up temp file
      if (tempFile) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }

      const text = result.trim();
      if (text && !text.startsWith("ERROR:")) {
        return `OCR text:\n${text}`;
      }
      if (text.startsWith("ERROR:")) {
        throw new Error(text);
      }
      return "No text detected in the specified region.";
    } catch (error: any) {
      // Clean up temp file on error
      if (tempFile) {
        try {
          require("fs").unlinkSync(tempFile);
        } catch {}
      }
      throw new Error(`OCR failed: ${error.message}`);
    }
  },
});

// Tool 24: Wait for Screen Change
server.addTool({
  name: "waitForChange",
  description:
    "Waits until a screen region visually changes beyond a threshold. Captures a baseline screenshot and polls for changes. Returns when change is detected or timeout is reached. Useful for waiting for loading to complete or UI updates.",
  parameters: z.object({
    region: z
      .object({
        x: z.number().min(0).describe("X coordinate"),
        y: z.number().min(0).describe("Y coordinate"),
        width: z.number().min(1).describe("Width of region"),
        height: z.number().min(1).describe("Height of region"),
      })
      .describe("Screen region to monitor"),
    timeout: z
      .number()
      .default(30000)
      .describe("Timeout in milliseconds (capped at 60000)"),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .default(0.05)
      .describe(
        "Minimum change ratio (0.0-1.0) to trigger detection"
      ),
    pollInterval: z
      .number()
      .min(100)
      .default(500)
      .describe("Polling interval in milliseconds (minimum 100)"),
  }),
  execute: async ({ region, timeout, threshold, pollInterval }) => {
    // Validate region dimensions
    if (region.width <= 0 || region.height <= 0) {
      throw new Error("Region width and height must be positive");
    }
    // Cap timeout to prevent indefinite blocking
    timeout = Math.min(timeout, 60000);
    const { execFileSync } = child_process;
    const fs = require("fs");

    const captureRegion = (): Buffer => {
      const tmpFile = path.join(
        os.tmpdir(),
        `wfc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
      );
      try {
        execFileSync(
          "screencapture",
          [
            "-x",
            "-R",
            `${region.x},${region.y},${region.width},${region.height}`,
            tmpFile,
          ],
          { timeout: 5000 }
        );
        return fs.readFileSync(tmpFile);
      } finally {
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }
    };

    // Convert PNG to raw BMP for reliable pixel-level comparison
    const getPixelData = (pngBuffer: Buffer): Buffer => {
      const tmpPng = path.join(
        os.tmpdir(),
        `wfc_raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
      );
      const tmpBmp = tmpPng.replace(".png", ".bmp");
      try {
        fs.writeFileSync(tmpPng, pngBuffer);
        execFileSync(
          "sips",
          ["-s", "format", "bmp", tmpPng, "--out", tmpBmp],
          { timeout: 5000, stdio: "pipe" }
        );
        return fs.readFileSync(tmpBmp);
      } finally {
        try {
          fs.unlinkSync(tmpPng);
        } catch {}
        try {
          fs.unlinkSync(tmpBmp);
        } catch {}
      }
    };

    // Capture baseline
    let baseline: Buffer;
    try {
      const pngData = captureRegion();
      baseline = getPixelData(pngData);
    } catch (error: any) {
      throw new Error(`Failed to capture baseline: ${error.message}`);
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      try {
        const pngData = captureRegion();
        const current = getPixelData(pngData);

        // Compare pixel data using proper BMP row-stride (rows are padded to 4-byte boundary)
        const headerSize =
          baseline.length >= 14 ? baseline.readUInt32LE(10) : 54;
        const bpp =
          baseline.length >= 30 ? baseline.readUInt16LE(28) : 32;
        const bytesPerPixel = bpp / 8;
        if (baseline.length < 26 || bytesPerPixel < 3) continue;

        const width = baseline.readInt32LE(18);
        const heightRaw = baseline.readInt32LE(22);
        const height = Math.abs(heightRaw);
        if (width <= 0 || height <= 0) continue;

        // BMP rows are padded to 4-byte boundary
        const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
        const pixelDataLen = Math.min(
          baseline.length - headerSize,
          current.length - headerSize
        );
        if (pixelDataLen <= 0) continue;

        const rows = Math.min(height, Math.floor(pixelDataLen / rowSize));
        let diffCount = 0;
        let totalSamples = 0;

        for (let y = 0; y < rows; y++) {
          const rowOffset = headerSize + y * rowSize;
          for (let x = 0; x < width; x++) {
            const idx = rowOffset + x * bytesPerPixel;
            if (idx + 2 >= baseline.length || idx + 2 >= current.length) break;
            if (
              baseline[idx] !== current[idx] ||
              baseline[idx + 1] !== current[idx + 1] ||
              baseline[idx + 2] !== current[idx + 2]
            ) {
              diffCount++;
            }
            totalSamples++;
          }
        }
        const diffRatio =
          totalSamples > 0 ? diffCount / totalSamples : 0;

        if (diffRatio >= threshold) {
          const elapsed = (
            (Date.now() - startTime) /
            1000
          ).toFixed(1);
          const pct = (diffRatio * 100).toFixed(1);
          return `Change detected in region (${region.x}, ${region.y}, ${region.width}x${region.height}) after ${elapsed}s. ${pct}% of pixels changed.`;
        }
      } catch {
        // Ignore individual capture failures, keep polling
        continue;
      }
    }

    return `Timeout: no significant change detected in region (${region.x}, ${region.y}, ${region.width}x${region.height}) after ${timeout / 1000}s (threshold: ${(threshold * 100).toFixed(0)}%).`;
  },
});

// Tool 25: Multi-Monitor Information
server.addTool({
  name: "multiMonitor",
  description:
    "Returns information about all connected displays including name, resolution, and whether they are Retina, primary, or mirrored. Useful for multi-monitor setups.",
  parameters: z.object({}),
  execute: async () => {
    const { execFileSync } = child_process;

    try {
      const output = execFileSync(
        "system_profiler",
        ["SPDisplaysDataType", "-json"],
        { encoding: "utf-8", timeout: 10000 }
      );

      const data = JSON.parse(output);
      const displays: string[] = [];
      let idx = 1;

      for (const gpu of data.SPDisplaysDataType || []) {
        for (const display of gpu.spdisplays_ndrvs || []) {
          const name = display._name || "Unknown";
          const resolution =
            display._spdisplays_resolution || "Unknown";
          const retina = display.spdisplays_retina
            ? " (Retina)"
            : "";
          const main =
            display.spdisplays_main === "spdisplays_yes"
              ? " (primary)"
              : "";
          const mirror =
            display.spdisplays_mirror === "spdisplays_on"
              ? " [mirrored]"
              : "";
          displays.push(
            `[${idx}] ${name}: ${resolution}${retina}${main}${mirror}`
          );
          idx++;
        }
      }

      if (displays.length === 0) {
        // Fallback to nutjs
        try {
          requireNutjs();
          const w = await screen.width();
          const h = await screen.height();
          return `Monitors (1):\n[1] ${w}x${h} (primary)`;
        } catch {
          return "No display information available.";
        }
      }

      return `Monitors (${displays.length}):\n${displays.join("\n")}`;
    } catch (error: any) {
      // Fallback
      try {
        requireNutjs();
        const w = await screen.width();
        const h = await screen.height();
        return `Monitors (1):\n[1] ${w}x${h} (primary)`;
      } catch {
        throw new Error(
          `Failed to get monitor info: ${error.message}`
        );
      }
    }
  },
});

// ============== OSASCRIPT macOS TOOLS ==============

// Helper: escape string for safe AppleScript interpolation
const escapeForAppleScript = (s: string): string =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");

// Helper: execute AppleScript safely and return trimmed output
const runAppleScript = (script: string, timeoutMs: number = 10000): string => {
  const { execFileSync } = child_process;
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf-8",
    timeout: timeoutMs,
  }).trim();
};

// Tool 26: Volume Control
server.addTool({
  name: "volumeControl",
  description:
    "Control macOS system volume. Get current level, set to specific value (0-100), mute, unmute, or toggle mute.",
  parameters: z.object({
    action: z
      .enum(["get", "set", "mute", "unmute", "toggle"])
      .describe("Action to perform"),
    level: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Volume level 0-100 (required for 'set' action)"),
  }),
  execute: async ({ action, level }) => {
    switch (action) {
      case "get": {
        const vol = runAppleScript("output volume of (get volume settings)");
        const muted = runAppleScript(
          "output muted of (get volume settings)"
        );
        return `Volume: ${vol}%, Muted: ${muted}`;
      }
      case "set": {
        if (level === undefined)
          throw new Error("Level is required for 'set' action");
        runAppleScript(`set volume output volume ${level}`);
        return `Volume set to ${level}%`;
      }
      case "mute": {
        runAppleScript("set volume with output muted");
        return "Volume muted.";
      }
      case "unmute": {
        runAppleScript("set volume without output muted");
        return "Volume unmuted.";
      }
      case "toggle": {
        const isMuted = runAppleScript(
          "output muted of (get volume settings)"
        );
        if (isMuted === "true") {
          runAppleScript("set volume without output muted");
          return "Volume unmuted.";
        } else {
          runAppleScript("set volume with output muted");
          return "Volume muted.";
        }
      }
    }
  },
});

// Tool 27: Brightness Control
server.addTool({
  name: "brightnessControl",
  description:
    "Control macOS display brightness. Get current level or set to a specific value (0.0-1.0 scale).",
  parameters: z.object({
    action: z.enum(["get", "set"]).describe("Action to perform"),
    level: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Brightness level 0.0-1.0 (required for 'set' action). 0=darkest, 1=brightest."
      ),
  }),
  execute: async ({ action, level }) => {
    const { execFileSync } = child_process;
    if (action === "get") {
      try {
        // Try using brightness CLI (brew install brightness)
        const output = execFileSync("brightness", ["-l"], {
          encoding: "utf-8",
          timeout: 5000,
        });
        const match = output.match(/brightness\s+([\d.]+)/);
        if (match) {
          const pct = Math.round(parseFloat(match[1]) * 100);
          return `Display brightness: ${pct}% (${match[1]})`;
        }
        return `Brightness output: ${output.trim()}`;
      } catch {
        throw new Error(
          "Cannot get brightness. Install 'brightness' CLI via Homebrew: brew install brightness"
        );
      }
    } else {
      if (level === undefined)
        throw new Error("Level is required for 'set' action");
      try {
        execFileSync("brightness", [String(level)], {
          encoding: "utf-8",
          timeout: 5000,
        });
        return `Brightness set to ${Math.round(level * 100)}% (${level})`;
      } catch (e: any) {
        throw new Error(
          `Cannot set brightness. Install 'brightness' via Homebrew: brew install brightness. Error: ${e.message}`
        );
      }
    }
  },
});

// Tool 28: App Control
server.addTool({
  name: "appControl",
  description:
    "Control macOS applications: launch, quit, force-quit, hide, unhide, check if running, or list all running apps.",
  parameters: z.object({
    action: z
      .enum(["launch", "quit", "forceQuit", "hide", "unhide", "isRunning", "list"])
      .describe("Action to perform"),
    appName: z
      .string()
      .optional()
      .describe(
        "Application name (e.g., 'Safari', 'Finder'). Required for all actions except 'list'."
      ),
  }),
  execute: async ({ action, appName }) => {
    if (action !== "list" && !appName) {
      throw new Error(`appName is required for '${action}' action.`);
    }
    const esc = appName ? escapeForAppleScript(appName) : "";

    switch (action) {
      case "launch":
        runAppleScript(`tell application "${esc}" to activate`);
        return `Launched "${appName}".`;
      case "quit":
        runAppleScript(`tell application "${esc}" to quit`);
        return `Quit "${appName}".`;
      case "forceQuit": {
        const { execFileSync } = child_process;
        try {
          execFileSync("killall", ["-9", appName!], {
            encoding: "utf-8",
            timeout: 5000,
          });
        } catch {
          // killall returns non-zero if process not found
        }
        return `Force-killed "${appName}" (SIGKILL).`;
      }
      case "hide":
        runAppleScript(
          `tell application "System Events" to set visible of process "${esc}" to false`
        );
        return `Hidden "${appName}".`;
      case "unhide":
        runAppleScript(
          `tell application "System Events" to set visible of process "${esc}" to true`
        );
        runAppleScript(`tell application "${esc}" to activate`);
        return `Unhidden and activated "${appName}".`;
      case "isRunning": {
        const result = runAppleScript(
          `tell application "System Events" to (name of processes) contains "${esc}"`
        );
        return `"${appName}" is ${result === "true" ? "running" : "not running"}.`;
      }
      case "list": {
        const result = runAppleScript(
          'tell application "System Events" to get name of every process whose background only is false'
        );
        return `Running apps:\n${result}`;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
});

// Tool 29: Menu Click
server.addTool({
  name: "menuClick",
  description:
    'Click a menu item in an application\'s menu bar. Provide the app process name and menu path as an array (e.g., ["File", "Save As..."]).',
  parameters: z.object({
    appName: z
      .string()
      .describe(
        "Application process name (e.g., 'Safari', 'Finder', 'Code')"
      ),
    menuPath: z
      .array(z.string())
      .min(1)
      .max(5)
      .describe(
        'Menu path from menu bar to item, e.g., ["File", "Save As..."] or ["View", "Developer", "Developer Tools"]'
      ),
  }),
  execute: async ({ appName, menuPath }) => {
    const escApp = escapeForAppleScript(appName);

    // Activate app and wait for menu bar to render
    runAppleScript(`tell application "${escApp}" to activate\ndelay 0.3`);

    // Build nested menu click AppleScript
    // menuPath[0] = top-level menu, menuPath[1..n-1] = submenus, menuPath[n] = item
    if (menuPath.length === 1) {
      // Just clicking a top-level menu (unusual but supported)
      const escMenu = escapeForAppleScript(menuPath[0]);
      runAppleScript(
        `tell application "System Events" to tell process "${escApp}" to click menu bar item "${escMenu}" of menu bar 1`
      );
      return `Clicked menu bar item "${menuPath[0]}" in ${appName}.`;
    }

    // Build from innermost to outermost
    const topMenu = escapeForAppleScript(menuPath[0]);
    const targetItem = escapeForAppleScript(menuPath[menuPath.length - 1]);

    let script: string;
    if (menuPath.length === 2) {
      // Simple: File > Save
      script = `tell application "System Events" to tell process "${escApp}" to click menu item "${targetItem}" of menu 1 of menu bar item "${topMenu}" of menu bar 1`;
    } else {
      // Nested: View > Developer > Developer Tools
      // Build the chain from the target item back up
      let chain = `menu item "${targetItem}"`;
      for (let i = menuPath.length - 2; i >= 1; i--) {
        const sub = escapeForAppleScript(menuPath[i]);
        chain = `${chain} of menu 1 of menu item "${sub}"`;
      }
      chain = `${chain} of menu 1 of menu bar item "${topMenu}" of menu bar 1`;
      script = `tell application "System Events" to tell process "${escApp}" to click ${chain}`;
    }

    try {
      runAppleScript(script);
      return `Clicked menu: ${appName} > ${menuPath.join(" > ")}`;
    } catch (e: any) {
      throw new Error(
        `Failed to click menu path [${menuPath.join(" > ")}] in ${appName}: ${e.message}`
      );
    }
  },
});

// Tool 30: Clipboard
server.addTool({
  name: "clipboard",
  description:
    "Read from, write to, or clear the macOS system clipboard (pasteboard).",
  parameters: z.object({
    action: z
      .enum(["read", "write", "clear"])
      .describe("Action to perform"),
    text: z
      .string()
      .optional()
      .describe("Text to write to clipboard (required for 'write' action)"),
  }),
  execute: async ({ action, text }) => {
    const { execFileSync } = child_process;

    switch (action) {
      case "read": {
        try {
          const content = execFileSync("pbpaste", {
            encoding: "utf-8",
            timeout: 5000,
          });
          if (content.length === 0) {
            return "Clipboard is empty.";
          }
          return `Clipboard content (${content.length} chars):\n${content}`;
        } catch (e: any) {
          throw new Error(`Failed to read clipboard: ${e.message}`);
        }
      }
      case "write": {
        if (text === undefined)
          throw new Error("text is required for 'write' action");
        try {
          child_process.execSync("pbcopy", {
            input: text,
            encoding: "utf-8",
            timeout: 5000,
          });
          return `Wrote ${text.length} characters to clipboard.`;
        } catch (e: any) {
          throw new Error(`Failed to write to clipboard: ${e.message}`);
        }
      }
      case "clear": {
        try {
          child_process.execSync("pbcopy", {
            input: "",
            encoding: "utf-8",
            timeout: 5000,
          });
          return "Clipboard cleared.";
        } catch (e: any) {
          throw new Error(`Failed to clear clipboard: ${e.message}`);
        }
      }
    }
  },
});

// Tool 31: Dialog
server.addTool({
  name: "dialog",
  description:
    "Display a macOS dialog to the user and return their response. Supports alert (OK/Cancel), text prompt, list selection, and file picker.",
  parameters: z.object({
    type: z
      .enum(["alert", "prompt", "choose", "fileChoose"])
      .describe("Dialog type"),
    message: z
      .string()
      .optional()
      .describe("Message to display (for alert and prompt types)"),
    title: z
      .string()
      .optional()
      .describe("Dialog title"),
    defaultAnswer: z
      .string()
      .optional()
      .describe("Default text for prompt type"),
    choices: z
      .array(z.string())
      .optional()
      .describe("List of choices for 'choose' type"),
    fileTypes: z
      .array(z.string())
      .optional()
      .describe(
        'Allowed file extensions for fileChoose (e.g., ["txt", "pdf", "jpg"])'
      ),
    multipleSelection: z
      .boolean()
      .optional()
      .default(false)
      .describe("Allow multiple selections for choose/fileChoose"),
  }),
  execute: async ({
    type,
    message,
    title,
    defaultAnswer,
    choices,
    fileTypes,
    multipleSelection,
  }) => {
    const escMsg = message ? escapeForAppleScript(message) : "Please respond";
    const escTitle = title ? escapeForAppleScript(title) : "";

    switch (type) {
      case "alert": {
        let script = `display dialog "${escMsg}"`;
        if (title) script += ` with title "${escTitle}"`;
        script += ' buttons {"Cancel", "OK"} default button "OK"';
        try {
          const result = runAppleScript(script, 120000);
          return `Dialog result: ${result}`;
        } catch (e: any) {
          if (e.message.includes("User canceled"))
            return "User canceled the dialog.";
          throw new Error(`Dialog failed: ${e.message}`);
        }
      }
      case "prompt": {
        let script = `display dialog "${escMsg}"`;
        if (title) script += ` with title "${escTitle}"`;
        const escDefault = defaultAnswer
          ? escapeForAppleScript(defaultAnswer)
          : "";
        script += ` default answer "${escDefault}"`;
        try {
          const result = runAppleScript(script, 120000);
          return `Prompt result: ${result}`;
        } catch (e: any) {
          if (e.message.includes("User canceled"))
            return "User canceled the prompt.";
          throw new Error(`Prompt failed: ${e.message}`);
        }
      }
      case "choose": {
        if (!choices || choices.length === 0)
          throw new Error("choices array is required for 'choose' type");
        const choiceList = choices
          .map((c) => `"${escapeForAppleScript(c)}"`)
          .join(", ");
        let script = `choose from list {${choiceList}}`;
        if (message)
          script += ` with prompt "${escMsg}"`;
        if (title) script += ` with title "${escTitle}"`;
        if (multipleSelection)
          script += " with multiple selections allowed";
        try {
          const result = runAppleScript(script, 120000);
          if (result === "false") return "User canceled the selection.";
          return `Selected: ${result}`;
        } catch (e: any) {
          throw new Error(`Choose dialog failed: ${e.message}`);
        }
      }
      case "fileChoose": {
        let chooseCmd = 'choose file with prompt "Select a file"';
        if (message) chooseCmd = `choose file with prompt "${escMsg}"`;
        if (fileTypes && fileTypes.length > 0) {
          const types = fileTypes
            .map((t) => `"${escapeForAppleScript(t)}"`)
            .join(", ");
          chooseCmd += ` of type {${types}}`;
        }
        if (multipleSelection) {
          chooseCmd += " with multiple selections allowed";
          // Multiple selection returns a list — iterate to get POSIX paths
          const script = `set theFiles to (${chooseCmd})\nset output to ""\nrepeat with aFile in theFiles\nset output to output & POSIX path of aFile & linefeed\nend repeat\nreturn output`;
          try {
            const posix = runAppleScript(script, 120000);
            return `Selected files:\n${posix.trim()}`;
          } catch (e: any) {
            if (e.message.includes("User canceled"))
              return "User canceled file selection.";
            throw new Error(`File choose failed: ${e.message}`);
          }
        } else {
          const script = `set theFile to (${chooseCmd})\nPOSIX path of theFile`;
          try {
            const posix = runAppleScript(script, 120000);
            return `Selected file: ${posix}`;
          } catch (e: any) {
            if (e.message.includes("User canceled"))
              return "User canceled file selection.";
            throw new Error(`File choose failed: ${e.message}`);
          }
        }
      }
    }
  },
});

// Tool 32: Finder Control
server.addTool({
  name: "finderControl",
  description:
    "Control macOS Finder: reveal files, get selection, open with specific app, move to trash, empty trash, or open new window.",
  parameters: z.object({
    action: z
      .enum([
        "reveal",
        "getSelection",
        "openWith",
        "trash",
        "emptyTrash",
        "newWindow",
      ])
      .describe("Action to perform"),
    filePath: z
      .string()
      .optional()
      .describe(
        "File path (required for reveal, openWith, trash)"
      ),
    appName: z
      .string()
      .optional()
      .describe("Application name for openWith action"),
    confirmEmptyTrash: z
      .string()
      .optional()
      .describe(
        'Type "CONFIRM" to empty trash (required safety check for emptyTrash action)'
      ),
  }),
  execute: async ({ action, filePath, appName, confirmEmptyTrash }) => {
    switch (action) {
      case "reveal": {
        if (!filePath) throw new Error("filePath is required for reveal");
        const resolved = path.resolve(filePath);
        const escPath = escapeForAppleScript(resolved);
        runAppleScript(
          `tell application "Finder" to reveal POSIX file "${escPath}"`
        );
        runAppleScript('tell application "Finder" to activate');
        return `Revealed "${resolved}" in Finder.`;
      }
      case "getSelection": {
        const result = runAppleScript(
          'tell application "Finder"\nset sel to selection as alias list\nset output to ""\nrepeat with f in sel\nset output to output & POSIX path of f & linefeed\nend repeat\nreturn output\nend tell'
        );
        if (!result || result.trim() === "")
          return "No files selected in Finder.";
        return `Finder selection:\n${result.trim()}`;
      }
      case "openWith": {
        if (!filePath) throw new Error("filePath is required for openWith");
        if (!appName) throw new Error("appName is required for openWith");
        const resolved = path.resolve(filePath);
        const { execFileSync } = child_process;
        execFileSync("open", ["-a", appName, resolved], {
          encoding: "utf-8",
          timeout: 10000,
        });
        return `Opened "${resolved}" with "${appName}".`;
      }
      case "trash": {
        if (!filePath) throw new Error("filePath is required for trash");
        const resolved = path.resolve(filePath);
        const escPath = escapeForAppleScript(resolved);
        runAppleScript(
          `tell application "Finder" to delete POSIX file "${escPath}"`
        );
        return `Moved "${resolved}" to Trash.`;
      }
      case "emptyTrash": {
        if (confirmEmptyTrash !== "CONFIRM") {
          throw new Error(
            'Safety check: set confirmEmptyTrash to "CONFIRM" to empty the trash. This is irreversible.'
          );
        }
        runAppleScript(
          'tell application "Finder" to empty the trash'
        );
        return "Trash emptied.";
      }
      case "newWindow": {
        runAppleScript(
          'tell application "Finder" to make new Finder window'
        );
        runAppleScript('tell application "Finder" to activate');
        return "New Finder window opened.";
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  },
});

// Tool 33: System Info (Extended)
server.addTool({
  name: "systemInfoExtended",
  description:
    "Get extended macOS system information including OS version, computer name, battery, dark mode, WiFi, uptime, and more.",
  parameters: z.object({}),
  execute: async () => {
    const { execFileSync } = child_process;
    const info: string[] = [];

    // macOS version
    try {
      const ver = execFileSync("sw_vers", ["-productVersion"], {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const build = execFileSync("sw_vers", ["-buildVersion"], {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      info.push(`macOS: ${ver} (${build})`);
    } catch {
      info.push("macOS: unknown");
    }

    // Computer name
    try {
      const name = runAppleScript(
        'computer name of (system info)'
      );
      info.push(`Computer: ${name}`);
    } catch {
      info.push("Computer: unknown");
    }

    // User name
    try {
      const user = execFileSync("whoami", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      info.push(`User: ${user}`);
    } catch {}

    // Uptime
    try {
      const uptime = execFileSync("uptime", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      info.push(`Uptime: ${uptime}`);
    } catch {}

    // Battery
    try {
      const bat = execFileSync("pmset", ["-g", "batt"], {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      const pctMatch = bat.match(/(\d+)%/);
      const charging = bat.includes("charging") || bat.includes("AC Power");
      if (pctMatch) {
        info.push(
          `Battery: ${pctMatch[1]}%${charging ? " (charging/AC)" : " (battery)"}`
        );
      }
    } catch {}

    // Dark mode
    try {
      const dark = runAppleScript(
        'tell application "System Events" to tell appearance preferences to get dark mode'
      );
      info.push(`Dark mode: ${dark === "true" ? "on" : "off"}`);
    } catch {}

    // WiFi — discover interface dynamically (en0 on MacBooks, en1 on desktops)
    try {
      const hwPorts = execFileSync(
        "networksetup",
        ["-listallhardwareports"],
        { encoding: "utf-8", timeout: 5000 }
      );
      const wifiMatch = hwPorts.match(/Hardware Port: Wi-Fi\nDevice: (\w+)/);
      const wifiDev = wifiMatch ? wifiMatch[1] : "en0";
      const wifi = execFileSync(
        "networksetup",
        ["-getairportnetwork", wifiDev],
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      info.push(`WiFi: ${wifi.replace("Current Wi-Fi Network: ", "")}`);
    } catch {
      info.push("WiFi: not available");
    }

    // Volume
    try {
      const vol = runAppleScript("output volume of (get volume settings)");
      const muted = runAppleScript("output muted of (get volume settings)");
      info.push(`Volume: ${vol}%${muted === "true" ? " (muted)" : ""}`);
    } catch {}

    return `System Information:\n${info.join("\n")}`;
  },
});

// Tool 34: Dark Mode Control
server.addTool({
  name: "darkMode",
  description:
    "Control macOS dark/light mode appearance. Get current state, enable, disable, or toggle.",
  parameters: z.object({
    action: z
      .enum(["get", "enable", "disable", "toggle"])
      .describe("Action to perform"),
  }),
  execute: async ({ action }) => {
    const getMode = () =>
      runAppleScript(
        'tell application "System Events" to tell appearance preferences to get dark mode'
      );

    switch (action) {
      case "get": {
        const isDark = getMode();
        return `Dark mode is ${isDark === "true" ? "enabled" : "disabled"}.`;
      }
      case "enable":
        runAppleScript(
          'tell application "System Events" to tell appearance preferences to set dark mode to true'
        );
        return "Dark mode enabled.";
      case "disable":
        runAppleScript(
          'tell application "System Events" to tell appearance preferences to set dark mode to false'
        );
        return "Dark mode disabled.";
      case "toggle": {
        const isDark = getMode();
        const newMode = isDark === "true" ? "false" : "true";
        runAppleScript(
          `tell application "System Events" to tell appearance preferences to set dark mode to ${newMode}`
        );
        return `Dark mode ${newMode === "true" ? "enabled" : "disabled"}.`;
      }
    }
  },
});

// Tool 35: Text-to-Speech
server.addTool({
  name: "sayText",
  description:
    "Speak text aloud using macOS text-to-speech. Optionally specify a voice and speaking rate.",
  parameters: z.object({
    text: z.string().describe("Text to speak"),
    voice: z
      .string()
      .optional()
      .describe(
        "Voice name (e.g., 'Alex', 'Samantha', 'Daniel', 'Karen'). Use 'say -v ?' to list all available voices."
      ),
    rate: z
      .number()
      .min(50)
      .max(500)
      .optional()
      .describe("Speaking rate in words per minute (default ~175, range 50-500)"),
  }),
  execute: async ({ text, voice, rate }) => {
    const { execFileSync } = child_process;
    const args: string[] = [];

    if (voice) {
      args.push("-v", voice);
    }
    if (rate) {
      args.push("-r", String(rate));
    }
    args.push(text);

    try {
      execFileSync("say", args, {
        encoding: "utf-8",
        timeout: 60000,
      });
      return `Spoke ${text.length} characters${voice ? ` with voice "${voice}"` : ""}${rate ? ` at ${rate} wpm` : ""}.`;
    } catch (e: any) {
      throw new Error(`Text-to-speech failed: ${e.message}`);
    }
  },
});

// ============== DEV WORKFLOW TOOLS ==============

// Tool 36: Accessibility Inspector
server.addTool({
  name: "accessibilityInspector",
  description:
    "Read the accessibility tree of a macOS application window. Returns UI element hierarchy with roles, titles, values, and enabled states. Useful for verifying UI state programmatically.",
  parameters: z.object({
    appName: z
      .string()
      .describe("Application process name (e.g., 'Safari', 'Finder', 'Code')"),
    windowIndex: z
      .number()
      .min(1)
      .optional()
      .default(1)
      .describe("Window index (1-based, default 1 = frontmost window)"),
    maxDepth: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .default(4)
      .describe("Maximum depth to traverse (default 4, max 4)"),
    filter: z
      .string()
      .optional()
      .describe(
        "Only return elements whose role or title contains this string (case-insensitive)"
      ),
  }),
  execute: async ({ appName, windowIndex, maxDepth, filter }) => {
    const escApp = escapeForAppleScript(appName);

    // First check if app is running and get window count
    try {
      const windowCount = runAppleScript(
        `tell application "System Events" to tell process "${escApp}" to count of windows`
      );
      if (parseInt(windowCount) === 0) {
        return `"${appName}" has no open windows.`;
      }
      if (windowIndex! > parseInt(windowCount)) {
        return `"${appName}" has ${windowCount} window(s), requested index ${windowIndex}.`;
      }
    } catch (e: any) {
      throw new Error(
        `Cannot access "${appName}". Ensure it's running and Accessibility is enabled. Error: ${e.message}`
      );
    }

    // Build recursive AppleScript to walk UI element tree
    // We use a flattened approach since AppleScript recursion is limited
    const script = `
tell application "System Events"
  tell process "${escApp}"
    set windowRef to window ${windowIndex}
    set output to ""
    set output to output & "Window: " & (name of windowRef) & linefeed

    -- Level 1: direct children of window
    try
      set elems to UI elements of windowRef
      repeat with e in elems
        set r to role of e
        set t to ""
        try
          set t to name of e
        end try
        set v to ""
        try
          set v to value of e as text
        end try
        set en to true
        try
          set en to enabled of e
        end try
        set output to output & "  [" & r & "] " & t
        if v is not "" and v is not t then set output to output & " = " & v
        if en is false then set output to output & " (disabled)"
        set output to output & linefeed

        ${maxDepth! >= 2 ? `
        -- Level 2
        try
          set elems2 to UI elements of e
          repeat with e2 in elems2
            set r2 to role of e2
            set t2 to ""
            try
              set t2 to name of e2
            end try
            set v2 to ""
            try
              set v2 to value of e2 as text
            end try
            set en2 to true
            try
              set en2 to enabled of e2
            end try
            set output to output & "    [" & r2 & "] " & t2
            if v2 is not "" and v2 is not t2 then set output to output & " = " & v2
            if en2 is false then set output to output & " (disabled)"
            set output to output & linefeed

            ${maxDepth! >= 3 ? `
            -- Level 3
            try
              set elems3 to UI elements of e2
              repeat with e3 in elems3
                set r3 to role of e3
                set t3 to ""
                try
                  set t3 to name of e3
                end try
                set v3 to ""
                try
                  set v3 to value of e3 as text
                end try
                set en3 to true
                try
                  set en3 to enabled of e3
                end try
                set output to output & "      [" & r3 & "] " & t3
                if v3 is not "" and v3 is not t3 then set output to output & " = " & v3
                if en3 is false then set output to output & " (disabled)"
                set output to output & linefeed

                ${maxDepth! >= 4 ? `
                -- Level 4
                try
                  set elems4 to UI elements of e3
                  repeat with e4 in elems4
                    set r4 to role of e4
                    set t4 to ""
                    try
                      set t4 to name of e4
                    end try
                    set v4 to ""
                    try
                      set v4 to value of e4 as text
                    end try
                    set en4 to true
                    try
                      set en4 to enabled of e4
                    end try
                    set output to output & "        [" & r4 & "] " & t4
                    if v4 is not "" and v4 is not t4 then set output to output & " = " & v4
                    if en4 is false then set output to output & " (disabled)"
                    set output to output & linefeed
                  end repeat
                end try` : ""}
              end repeat
            end try` : ""}
          end repeat
        end try` : ""}
      end repeat
    end try

    return output
  end tell
end tell`.trim();

    try {
      let result = runAppleScript(script, 30000);

      // Apply filter if provided
      if (filter) {
        const filterLower = filter.toLowerCase();
        const lines = result.split("\n");
        const filtered = lines.filter(
          (line: string) =>
            line.trim().startsWith("Window:") ||
            line.toLowerCase().includes(filterLower)
        );
        result = filtered.length > 1
          ? filtered.join("\n")
          : `No elements matching "${filter}" found.\n\nFull tree has ${lines.length} elements.`;
      }

      return result;
    } catch (e: any) {
      throw new Error(`Accessibility inspection failed: ${e.message}`);
    }
  },
});

// ============== UI ELEMENT AUTOMATION TOOLS ==============
// Ported from: steipete/macos-automator-mcp, mb-dev/macos-ui-automation-mcp, antbotlab/mac-use-mcp

// Shared type for UI elements
interface UIElement {
  path: string;
  role: string;
  title: string;
  description: string;
  help: string;
  value: string;
  enabled: boolean;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

// Helper: Parse pipe-delimited AppleScript output into UIElement array
function parseElementOutput(rawOutput: string): UIElement[] {
  const elements: UIElement[] = [];
  const lines = rawOutput.split("\n").filter((l) => l.includes("|||"));
  for (const line of lines) {
    const parts = line.split("|||");
    if (parts.length < 10) continue;
    const [pathStr, role, title, desc, help, value, enabled, posX, posY, sizeW, sizeH] = parts;
    elements.push({
      path: pathStr.trim(),
      role: role.trim(),
      title: title.trim() === "missing value" ? "" : title.trim(),
      description: desc.trim() === "missing value" ? "" : desc.trim(),
      help: help.trim() === "missing value" ? "" : help.trim(),
      value: value.trim() === "missing value" ? "" : value.trim(),
      enabled: enabled.trim() === "true",
      position: { x: parseInt(posX) || 0, y: parseInt(posY) || 0 },
      size: { w: parseInt(sizeW) || 0, h: parseInt(sizeH) || 0 },
    });
  }
  return elements;
}

// Helper: Convert element path to AppleScript reference
// "scroll area 2 > checkbox 46" → "checkbox 46 of scroll area 2 of window 1"
function pathToAxReference(elementPath: string, windowIndex: number = 1): string {
  const parts = elementPath.split(" > ").map((p) => p.trim());
  // Reverse: deepest element first, window last
  return parts.reverse().join(" of ") + ` of window ${windowIndex}`;
}

// Helper: Build AppleScript to enumerate UI elements with pipe-delimited output
function buildElementQueryScript(
  appName: string,
  windowIndex: number = 1,
  scope?: string,
  roleFilter?: string,
  maxDepth: number = 1
): string {
  const escapedApp = escapeForAppleScript(appName);
  const scopeRef = scope
    ? `${escapeForAppleScript(scope)} of window ${windowIndex}`
    : `window ${windowIndex}`;

  // Build the role filter condition
  const roleCondition = roleFilter
    ? `if role of elem as string is not "${escapeForAppleScript(roleFilter)}" then`
    : "";
  const roleEnd = roleFilter ? "end if" : "";
  const roleSkip = roleFilter ? "set skip to true" : "";

  // For depth > 1, we need recursive traversal
  let depthScript = "";
  if (maxDepth >= 2) {
    depthScript = `
          -- Depth 2: enumerate children of each container
          try
            set childElems to UI elements of elem
            repeat with j from 1 to count of childElems
              set child to item j of childElems
              try
                set childRole to role of child as string
                set childRoleWord to childRole
                if childRoleWord starts with "AX" then set childRoleWord to text 3 thru -1 of childRoleWord
                -- Convert CamelCase to space-separated lowercase for path
                set childPathName to my toLowerFirst(childRoleWord)
                -- Count siblings of same role for indexing
                set childIdx to 0
                set childCount to 0
                repeat with k from 1 to count of childElems
                  set sibRole to role of (item k of childElems) as string
                  if sibRole is childRole then
                    set childCount to childCount + 1
                    if k is j then set childIdx to childCount
                  end if
                end repeat
                set childPathStr to elemPathStr & " > " & childPathName
                if childCount > 1 then set childPathStr to elemPathStr & " > " & childPathName & " " & childIdx
                ${roleCondition ? `set skip to false\n                ${roleCondition}\n                  ${roleSkip}\n                ${roleEnd}\n                if not skip then` : ""}
                set childTitle to ""
                try
                  set childTitle to title of child as string
                end try
                set childDesc to ""
                try
                  set childDesc to description of child as string
                end try
                set childHelp to ""
                try
                  set childHelp to help of child as string
                end try
                set childVal to ""
                try
                  set childVal to value of child as string
                end try
                set childEnabled to true
                try
                  set childEnabled to enabled of child
                end try
                set childPos to {0, 0}
                try
                  set childPos to position of child
                end try
                set childSz to {0, 0}
                try
                  set childSz to size of child
                end try
                set cpx to (item 1 of childPos) as text
                set cpy to (item 2 of childPos) as text
                set csx to (item 1 of childSz) as text
                set csy to (item 2 of childSz) as text
                set cenb to (childEnabled as text)
                set outputResult to outputResult & childPathStr & "|||" & childRole & "|||" & childTitle & "|||" & childDesc & "|||" & childHelp & "|||" & childVal & "|||" & cenb & "|||" & cpx & "|||" & cpy & "|||" & csx & "|||" & csy & linefeed
                ${roleCondition ? "end if" : ""}
              end try
            end repeat
          end try`;
  }

  return `
on toLowerFirst(txt)
  if length of txt is 0 then return txt
  set firstChar to character 1 of txt
  set lowerChars to "abcdefghijklmnopqrstuvwxyz"
  set upperChars to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  set idx to offset of firstChar in upperChars
  if idx > 0 then
    return (character idx of lowerChars) & (text 2 thru -1 of txt)
  end if
  return txt
end toLowerFirst

set outputResult to ""
tell application "System Events"
  tell process "${escapedApp}"
    set frontmost to true
    delay 0.1
    set allElems to UI elements of ${scopeRef}
    repeat with i from 1 to count of allElems
      set elem to item i of allElems
      try
        set elemRole to role of elem as string
        set elemRoleWord to elemRole
        if elemRoleWord starts with "AX" then set elemRoleWord to text 3 thru -1 of elemRoleWord
        set elemPathName to my toLowerFirst(elemRoleWord)
        -- Count siblings of same role for indexing
        set elemIdx to 0
        set elemCount to 0
        repeat with s from 1 to count of allElems
          set sibRole to role of (item s of allElems) as string
          if sibRole is elemRole then
            set elemCount to elemCount + 1
            if s is i then set elemIdx to elemCount
          end if
        end repeat
        set elemPathStr to elemPathName
        if elemCount > 1 then set elemPathStr to elemPathName & " " & elemIdx
        ${roleCondition ? `set skip to false\n        ${roleCondition}\n          ${roleSkip}\n        ${roleEnd}\n        if not skip then` : ""}
        set elemTitle to ""
        try
          set elemTitle to title of elem as string
        end try
        set elemDesc to ""
        try
          set elemDesc to description of elem as string
        end try
        set elemHelp to ""
        try
          set elemHelp to help of elem as string
        end try
        set elemVal to ""
        try
          set elemVal to value of elem as string
        end try
        set elemEnabled to true
        try
          set elemEnabled to enabled of elem
        end try
        set elemPos to {0, 0}
        try
          set elemPos to position of elem
        end try
        set elemSz to {0, 0}
        try
          set elemSz to size of elem
        end try
        set epx to (item 1 of elemPos) as text
        set epy to (item 2 of elemPos) as text
        set esx to (item 1 of elemSz) as text
        set esy to (item 2 of elemSz) as text
        set eenb to (elemEnabled as text)
        set outputResult to outputResult & elemPathStr & "|||" & elemRole & "|||" & elemTitle & "|||" & elemDesc & "|||" & elemHelp & "|||" & elemVal & "|||" & eenb & "|||" & epx & "|||" & epy & "|||" & esx & "|||" & esy & linefeed
        ${roleCondition ? "end if" : ""}
        ${depthScript}
      end try
    end repeat
  end tell
end tell
return outputResult`;
}

// Helper: Find element by search text across all properties
async function findElementBySearch(
  appName: string,
  search: string,
  windowIndex: number = 1,
  roleFilter?: string
): Promise<UIElement[]> {
  const searchLower = search.toLowerCase();

  // First try depth 1
  const script1 = buildElementQueryScript(appName, windowIndex, undefined, roleFilter, 1);
  let output: string;
  try {
    output = child_process.execFileSync("osascript", ["-e", script1], {
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
  } catch (e: any) {
    output = "";
  }
  let elements = parseElementOutput(output);
  let matches = elements.filter(
    (el) =>
      el.title.toLowerCase().includes(searchLower) ||
      el.description.toLowerCase().includes(searchLower) ||
      el.help.toLowerCase().includes(searchLower) ||
      el.value.toLowerCase().includes(searchLower)
  );
  if (matches.length > 0) return matches;

  // If nothing found at depth 1, try depth 2
  const script2 = buildElementQueryScript(appName, windowIndex, undefined, roleFilter, 2);
  try {
    output = child_process.execFileSync("osascript", ["-e", script2], {
      encoding: "utf-8",
      timeout: 30000,
    }).trim();
  } catch (e: any) {
    output = "";
  }
  elements = parseElementOutput(output);
  matches = elements.filter(
    (el) =>
      el.title.toLowerCase().includes(searchLower) ||
      el.description.toLowerCase().includes(searchLower) ||
      el.help.toLowerCase().includes(searchLower) ||
      el.value.toLowerCase().includes(searchLower)
  );
  return matches;
}

// Tool: uiListWindows
server.addTool({
  name: "uiListWindows",
  description:
    "List all windows for an application with name, index, position, and size. Returns structured JSON.",
  parameters: z.object({
    appName: z.string().describe("Application process name (e.g., 'Bookmap', 'Calculator')"),
  }),
  execute: async ({ appName }) => {
    const escapedApp = escapeForAppleScript(appName);
    const script = `
tell application "System Events"
  tell process "${escapedApp}"
    set outputStr to ""
    set allWindows to every window
    repeat with i from 1 to count of allWindows
      set w to item i of allWindows
      set wName to ""
      try
        set wName to name of w as string
      end try
      set wPos to position of w
      set wSize to size of w
      set px to (item 1 of wPos) as text
      set py to (item 2 of wPos) as text
      set sw to (item 1 of wSize) as text
      set sh to (item 2 of wSize) as text
      set idx to (i as text)
      set outputStr to outputStr & idx & "|||" & wName & "|||" & px & "|||" & py & "|||" & sw & "|||" & sh & linefeed
    end repeat
    return outputStr
  end tell
end tell`;
    try {
      const raw = runAppleScript(script, 10000);
      const windows = raw
        .split("\n")
        .filter((s) => s.includes("|||"))
        .map((line) => {
          const [idx, name, px, py, sw, sh] = line.split("|||");
          return {
            index: parseInt(idx),
            name: name === "missing value" ? "" : name,
            position: { x: parseInt(px) || 0, y: parseInt(py) || 0 },
            size: { w: parseInt(sw) || 0, h: parseInt(sh) || 0 },
          };
        });
      return JSON.stringify(windows, null, 2);
    } catch (e: any) {
      throw new Error(`uiListWindows failed: ${e.message}`);
    }
  },
});

// Tool: uiGetElements
server.addTool({
  name: "uiGetElements",
  description:
    "Get UI elements from an app window as structured JSON. Returns role, title, description, help text, value, position, size, and element path for each element. Use 'scope' to drill into containers (e.g., 'scroll area 2'). Critical for Java Swing apps where labels are in description/help, not title.",
  parameters: z.object({
    appName: z.string().describe("Application process name"),
    windowIndex: z.number().default(1).describe("Window index (1-based, default 1)"),
    scope: z
      .string()
      .optional()
      .describe("Scope into a container element (e.g., 'scroll area 2')"),
    roleFilter: z
      .string()
      .optional()
      .describe("Filter by accessibility role (e.g., 'AXButton', 'AXCheckBox')"),
    maxDepth: z.number().min(1).max(3).default(1).describe("Traversal depth (1-3, default 1)"),
  }),
  execute: async ({ appName, windowIndex, scope, roleFilter, maxDepth }) => {
    const script = buildElementQueryScript(appName, windowIndex, scope, roleFilter, maxDepth);
    let output: string;
    try {
      output = child_process.execFileSync("osascript", ["-e", script], {
        encoding: "utf-8",
        timeout: maxDepth > 1 ? 30000 : 15000,
      }).trim();
    } catch (e: any) {
      throw new Error(`uiGetElements failed: ${e.message}`);
    }
    const elements = parseElementOutput(output);
    return JSON.stringify(
      {
        appName,
        windowIndex,
        scope: scope || "(top level)",
        elementCount: elements.length,
        elements,
      },
      null,
      2
    );
  },
});

// Tool: uiFindElement
server.addTool({
  name: "uiFindElement",
  description:
    "Search for UI elements by text match across ALL properties (title, description, help, value). Case-insensitive. Automatically searches depth 1, then depth 2 if no matches found.",
  parameters: z.object({
    appName: z.string().describe("Application process name"),
    search: z.string().describe("Text to search for across all element properties"),
    windowIndex: z.number().default(1).describe("Window index (1-based, default 1)"),
    roleFilter: z
      .string()
      .optional()
      .describe("Filter by accessibility role (e.g., 'AXButton', 'AXCheckBox')"),
  }),
  execute: async ({ appName, search, windowIndex, roleFilter }) => {
    const matches = await findElementBySearch(appName, search, windowIndex, roleFilter);
    return JSON.stringify(
      {
        appName,
        search,
        matchCount: matches.length,
        matches,
      },
      null,
      2
    );
  },
});

// Tool: uiClickElement
server.addTool({
  name: "uiClickElement",
  description:
    "Click a UI element by search text or explicit element path. Supports AXPress, AXConfirm, AXCancel, AXShowMenu, AXRaise actions.",
  parameters: z.object({
    appName: z.string().describe("Application process name"),
    search: z
      .string()
      .optional()
      .describe("Search text to find element (searches title, description, help, value)"),
    elementPath: z
      .string()
      .optional()
      .describe("Explicit element path (e.g., 'scroll area 2 > checkbox 46')"),
    windowIndex: z.number().default(1).describe("Window index (1-based, default 1)"),
    action: z
      .enum(["AXPress", "AXConfirm", "AXCancel", "AXShowMenu", "AXRaise"])
      .default("AXPress")
      .describe("Accessibility action to perform (default: AXPress)"),
  }),
  execute: async ({ appName, search, elementPath, windowIndex, action }) => {
    if (!search && !elementPath) {
      throw new Error("Either 'search' or 'elementPath' must be provided");
    }

    const escapedApp = escapeForAppleScript(appName);
    let axRef: string;
    let elementDesc = "";

    if (elementPath) {
      // Direct path reference
      axRef = pathToAxReference(elementPath, windowIndex);
      elementDesc = elementPath;
    } else {
      // Search for element
      const matches = await findElementBySearch(appName, search!, windowIndex);
      if (matches.length === 0) {
        throw new Error(`No element found matching "${search}"`);
      }
      const target = matches[0];
      axRef = pathToAxReference(target.path, windowIndex);
      elementDesc = target.description || target.help || target.title || target.path;
    }

    const script = `
tell application "System Events"
  tell process "${escapedApp}"
    set frontmost to true
    delay 0.1
    perform action "${action}" of ${axRef}
  end tell
end tell
return "ok"`;

    try {
      runAppleScript(script, 10000);
      return `Clicked "${elementDesc}" (action: ${action})`;
    } catch (e: any) {
      throw new Error(`uiClickElement failed: ${e.message}`);
    }
  },
});

// Tool: uiSetValue
server.addTool({
  name: "uiSetValue",
  description:
    "Set the value of a UI element with type-aware handling and verification. Handles checkboxes (toggle only if needed), text fields, sliders, and combo boxes.",
  parameters: z.object({
    appName: z.string().describe("Application process name"),
    search: z
      .string()
      .optional()
      .describe("Search text to find element"),
    elementPath: z
      .string()
      .optional()
      .describe("Explicit element path (e.g., 'scroll area 2 > checkbox 46')"),
    value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to set"),
    windowIndex: z.number().default(1).describe("Window index (1-based, default 1)"),
  }),
  execute: async ({ appName, search, elementPath, value, windowIndex }) => {
    if (!search && !elementPath) {
      throw new Error("Either 'search' or 'elementPath' must be provided");
    }

    const escapedApp = escapeForAppleScript(appName);
    let target: UIElement;

    if (elementPath) {
      // We need to get element info for the path to know its role
      const script = buildElementQueryScript(appName, windowIndex, undefined, undefined, 2);
      let output: string;
      try {
        output = child_process.execFileSync("osascript", ["-e", script], {
          encoding: "utf-8",
          timeout: 30000,
        }).trim();
      } catch (e: any) {
        output = e.stderr?.toString() || "";
      }
      const elements = parseElementOutput(output);
      const found = elements.find((el) => el.path === elementPath);
      if (!found) throw new Error(`Element not found at path: ${elementPath}`);
      target = found;
    } else {
      const matches = await findElementBySearch(appName, search!, windowIndex);
      if (matches.length === 0) throw new Error(`No element found matching "${search}"`);
      target = matches[0];
    }

    const axRef = pathToAxReference(target.path, windowIndex);
    const elementDesc = target.description || target.help || target.title || target.path;
    const oldValue = target.value;

    // Type-aware value setting
    if (target.role === "AXCheckBox") {
      // Checkbox: toggle only if current value differs from desired
      const desiredVal = value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
      const currentVal = parseInt(target.value) || 0;
      if (currentVal === desiredVal) {
        return `"${elementDesc}" already has value ${desiredVal} — no change needed`;
      }
      const script = `
tell application "System Events"
  tell process "${escapedApp}"
    set frontmost to true
    delay 0.1
    click ${axRef}
    delay 0.2
    set newVal to value of ${axRef}
    return newVal as string
  end tell
end tell`;
      const newVal = runAppleScript(script, 10000);
      return `Set "${elementDesc}" to ${newVal} (was ${oldValue})`;
    } else {
      // Text field, slider, combo box: set value directly
      const valStr = typeof value === "string" ? `"${escapeForAppleScript(value)}"` : String(value);
      const script = `
tell application "System Events"
  tell process "${escapedApp}"
    set frontmost to true
    delay 0.1
    set value of ${axRef} to ${valStr}
    delay 0.2
    set newVal to value of ${axRef}
    return newVal as string
  end tell
end tell`;
      try {
        const newVal = runAppleScript(script, 10000);
        return `Set "${elementDesc}" to ${newVal} (was ${oldValue})`;
      } catch (e: any) {
        throw new Error(`uiSetValue failed for "${elementDesc}": ${e.message}`);
      }
    }
  },
});

// Tool: uiTypeIntoElement
server.addTool({
  name: "uiTypeIntoElement",
  description:
    "Type text into a specific UI element (text field, search box) by focusing it first. Optionally clears existing content before typing.",
  parameters: z.object({
    appName: z.string().describe("Application process name"),
    search: z
      .string()
      .optional()
      .describe("Search text to find the target element"),
    elementPath: z
      .string()
      .optional()
      .describe("Explicit element path"),
    text: z.string().describe("Text to type into the element"),
    clearFirst: z.boolean().default(true).describe("Clear existing content before typing (default: true)"),
    windowIndex: z.number().default(1).describe("Window index (1-based, default 1)"),
  }),
  execute: async ({ appName, search, elementPath, text, clearFirst, windowIndex }) => {
    if (!search && !elementPath) {
      throw new Error("Either 'search' or 'elementPath' must be provided");
    }

    const escapedApp = escapeForAppleScript(appName);
    let axRef: string;
    let elementDesc = "";

    if (elementPath) {
      axRef = pathToAxReference(elementPath, windowIndex);
      elementDesc = elementPath;
    } else {
      const matches = await findElementBySearch(appName, search!, windowIndex);
      if (matches.length === 0) throw new Error(`No element found matching "${search}"`);
      const target = matches[0];
      axRef = pathToAxReference(target.path, windowIndex);
      elementDesc = target.description || target.help || target.title || target.path;
    }

    const escapedText = escapeForAppleScript(text);
    const clearScript = clearFirst
      ? `
    keystroke "a" using command down
    delay 0.1
    key code 51 -- delete/backspace
    delay 0.1`
      : "";

    const script = `
tell application "System Events"
  tell process "${escapedApp}"
    set frontmost to true
    delay 0.1
    set focused of ${axRef} to true
    delay 0.2
    ${clearScript}
    keystroke "${escapedText}"
  end tell
end tell
return "ok"`;

    try {
      runAppleScript(script, 15000);
      return `Typed "${text}" into "${elementDesc}"${clearFirst ? " (cleared first)" : ""}`;
    } catch (e: any) {
      throw new Error(`uiTypeIntoElement failed: ${e.message}`);
    }
  },
});

// Tool: executeScript
server.addTool({
  name: "executeScript",
  description:
    "Execute arbitrary AppleScript or JXA (JavaScript for Automation) code. Powerful escape hatch for complex automation that can't be done with other tools.",
  parameters: z.object({
    script: z.string().describe("The script code to execute"),
    language: z
      .enum(["applescript", "jxa"])
      .default("applescript")
      .describe("Script language: applescript or jxa (JavaScript for Automation)"),
    timeoutSeconds: z
      .number()
      .min(1)
      .max(120)
      .default(30)
      .describe("Timeout in seconds (default: 30, max: 120)"),
  }),
  execute: async ({ script, language, timeoutSeconds }) => {
    const timeoutMs = timeoutSeconds * 1000;
    const args =
      language === "jxa"
        ? ["-l", "JavaScript", "-e", script]
        : ["-e", script];
    try {
      const result = child_process.execFileSync("osascript", args, {
        encoding: "utf-8",
        timeout: timeoutMs,
      });
      return result.trim() || "(script completed with no output)";
    } catch (e: any) {
      // osascript may output to stderr for "log" statements
      const stderr = e.stderr?.toString()?.trim() || "";
      if (stderr && e.status === 0) return stderr;
      throw new Error(
        `Script execution failed (${language}): ${e.message}${stderr ? "\nstderr: " + stderr : ""}`
      );
    }
  },
});

// Tool: appOverview
server.addTool({
  name: "appOverview",
  description:
    "Quick overview of an app's UI structure — windows, top-level element roles and counts. Useful for initial exploration before drilling in with uiGetElements.",
  parameters: z.object({
    appName: z.string().describe("Application process name"),
  }),
  execute: async ({ appName }) => {
    const escapedApp = escapeForAppleScript(appName);
    const script = `
tell application "System Events"
  tell process "${escapedApp}"
    set winCount to count of windows
    set outputStr to ""
    repeat with i from 1 to winCount
      set w to window i
      set wName to ""
      try
        set wName to name of w as string
      end try
      set elems to UI elements of w
      set roleCounts to ""
      set roleList to {}
      set countList to {}
      repeat with e in elems
        set r to role of e as string
        set found to false
        repeat with idx from 1 to count of roleList
          if item idx of roleList is r then
            set item idx of countList to (item idx of countList) + 1
            set found to true
            exit repeat
          end if
        end repeat
        if not found then
          set end of roleList to r
          set end of countList to 1
        end if
      end repeat
      set summary to ""
      repeat with idx from 1 to count of roleList
        if idx > 1 then set summary to summary & ", "
        set summary to summary & (item idx of roleList) & ":" & (item idx of countList)
      end repeat
      set idxStr to (i as text)
      set elemCntStr to ((count of elems) as text)
      set outputStr to outputStr & idxStr & "|||" & wName & "|||" & elemCntStr & "|||" & summary & linefeed
    end repeat
    return outputStr
  end tell
end tell`;
    try {
      const raw = runAppleScript(script, 15000);
      const windows = raw
        .split("\n")
        .filter((l) => l.includes("|||"))
        .map((line) => {
          const [idx, name, elemCount, summary] = line.split("|||");
          const elementSummary: Record<string, number> = {};
          if (summary) {
            summary.split(", ").forEach((pair) => {
              const [role, count] = pair.split(":");
              if (role && count) {
                // Clean role name: AXButton → button
                const cleanRole = role.startsWith("AX") ? role.slice(2).toLowerCase() : role.toLowerCase();
                elementSummary[cleanRole] = parseInt(count) || 0;
              }
            });
          }
          return {
            index: parseInt(idx),
            name: name === "missing value" ? "" : name,
            totalElements: parseInt(elemCount) || 0,
            elementSummary,
          };
        });

      return JSON.stringify(
        {
          processName: appName,
          windowCount: windows.length,
          windows,
        },
        null,
        2
      );
    } catch (e: any) {
      throw new Error(`appOverview failed: ${e.message}`);
    }
  },
});

// Tool: uiScreenshot
server.addTool({
  name: "uiScreenshot",
  description:
    "Screenshot the active (frontmost) window or a specific app's window, returning both the image AND window location/bounds metadata. Auto-discovers the active window without needing its name or ID. Ideal for automation workflows.",
  parameters: z.object({
    appName: z
      .string()
      .optional()
      .describe("Target app (default: frontmost app)"),
    windowIndex: z
      .number()
      .default(1)
      .describe("Which window to capture (1-based, default 1 = frontmost)"),
    includeLocation: z
      .boolean()
      .default(true)
      .describe("Include position/size metadata in response (default: true)"),
  }),
  execute: async ({ appName, windowIndex, includeLocation }) => {
    // Step 1: Get window info (app name, title, position, size)
    const infoScript = appName
      ? `
tell application "System Events"
  tell process "${escapeForAppleScript(appName)}"
    set w to window ${windowIndex}
    set wName to ""
    try
      set wName to name of w as string
    end try
    set wPos to position of w
    set wSz to size of w
    return name of current application & "|||" & "${escapeForAppleScript(appName)}" & "|||" & wName & "|||" & (item 1 of wPos) & "|||" & (item 2 of wPos) & "|||" & (item 1 of wSz) & "|||" & (item 2 of wSz)
  end tell
end tell`
      : `
tell application "System Events"
  set frontApp to first process whose frontmost is true
  set appName to name of frontApp
  set w to window ${windowIndex} of frontApp
  set wName to ""
  try
    set wName to name of w as string
  end try
  set wPos to position of w
  set wSz to size of w
  return name of current application & "|||" & appName & "|||" & wName & "|||" & (item 1 of wPos) & "|||" & (item 2 of wPos) & "|||" & (item 1 of wSz) & "|||" & (item 2 of wSz)
end tell`;

    let resolvedAppName: string;
    let windowTitle: string;
    let pos = { x: 0, y: 0 };
    let sz = { w: 0, h: 0 };

    try {
      const raw = runAppleScript(infoScript, 10000);
      const parts = raw.split("|||");
      resolvedAppName = parts[1] || appName || "Unknown";
      windowTitle = parts[2] === "missing value" ? "" : parts[2] || "";
      pos = { x: parseInt(parts[3]) || 0, y: parseInt(parts[4]) || 0 };
      sz = { w: parseInt(parts[5]) || 0, h: parseInt(parts[6]) || 0 };
    } catch (e: any) {
      throw new Error(`Could not get window info: ${e.message}`);
    }

    // Step 2: Get window ID for screencapture via CGWindowListCopyWindowInfo
    const windowIdScript = `
set appName to "${escapeForAppleScript(resolvedAppName)}"
set targetTitle to "${escapeForAppleScript(windowTitle)}"

-- Use JXA to get window ID via CGWindowListCopyWindowInfo bridge
set jsCode to "
ObjC.import('CoreGraphics');
var windows = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID);
var count = $.CFArrayGetCount(windows);
var targetId = -1;
for (var i = 0; i < count; i++) {
  var w = $.CFArrayGetValueAtIndex(windows, i);
  var owner = $.CFDictionaryGetValue(w, $('kCGWindowOwnerName'));
  if (owner) {
    owner = $.CFStringGetCStringPtr(owner, 0);
    if (owner == '" & appName & "') {
      var wid = $.CFDictionaryGetValue(w, $('kCGWindowNumber'));
      if (wid) {
        targetId = wid;
        break;
      }
    }
  }
}
targetId;
"
return do shell script "osascript -l JavaScript -e " & quoted form of jsCode`;

    let windowId: number | null = null;
    try {
      // Simpler approach: use window title with screencapture -l
      // Get window list via bash
      const listOutput = child_process.execFileSync(
        "osascript",
        [
          "-l",
          "JavaScript",
          "-e",
          `
ObjC.import('CoreGraphics');
ObjC.import('CoreFoundation');
var windows = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0));
var result = [];
for (var i = 0; i < windows.count; i++) {
  var w = windows.objectAtIndex(i);
  var owner = ObjC.unwrap(w.objectForKey('kCGWindowOwnerName')) || '';
  var wid = ObjC.unwrap(w.objectForKey('kCGWindowNumber')) || 0;
  var name = ObjC.unwrap(w.objectForKey('kCGWindowName')) || '';
  if (owner === '${escapeForAppleScript(resolvedAppName)}') {
    result.push(wid + '|||' + name);
  }
}
result.join('\\n');`,
        ],
        { encoding: "utf-8", timeout: 10000 }
      ).trim();

      if (listOutput) {
        const windowLines = listOutput.split("\n").filter((l) => l.includes("|||"));
        // Match by title if possible, otherwise take the Nth window
        if (windowTitle) {
          const match = windowLines.find((l) => l.includes(windowTitle));
          if (match) windowId = parseInt(match.split("|||")[0]);
        }
        if (!windowId && windowLines.length >= windowIndex) {
          windowId = parseInt(windowLines[windowIndex - 1].split("|||")[0]);
        }
        if (!windowId && windowLines.length > 0) {
          windowId = parseInt(windowLines[0].split("|||")[0]);
        }
      }
    } catch {
      // Fall back to region-based screenshot
    }

    // Step 3: Capture screenshot
    const filePath = path.join(os.tmpdir(), `mcp_uiscreenshot_${Date.now()}.png`);
    try {
      if (windowId) {
        child_process.execFileSync("screencapture", ["-x", `-l${windowId}`, filePath]);
      } else {
        // Fallback: region-based capture using position/size
        if (sz.w > 0 && sz.h > 0) {
          child_process.execFileSync("screencapture", [
            "-x",
            `-R${pos.x},${pos.y},${sz.w},${sz.h}`,
            filePath,
          ]);
        } else {
          // Last resort: full screen
          child_process.execFileSync("screencapture", ["-x", filePath]);
        }
      }
    } catch (e: any) {
      throw new Error(`Screenshot capture failed: ${e.message}`);
    }

    if (!require("fs").existsSync(filePath)) {
      throw new Error("Screenshot file was not created");
    }

    // Step 4: Get screen size for context
    let screenW = 0, screenH = 0;
    try {
      const screenInfo = runAppleScript(
        'tell application "Finder" to get bounds of window of desktop',
        5000
      );
      const bounds = screenInfo.split(", ").map((s) => parseInt(s));
      if (bounds.length >= 4) {
        screenW = bounds[2];
        screenH = bounds[3];
      }
    } catch {
      // Non-critical
    }

    try {
      const img = await imageContent({ path: filePath });

      if (includeLocation) {
        const locationInfo = JSON.stringify({
          appName: resolvedAppName,
          windowTitle,
          windowIndex,
          position: pos,
          size: sz,
          screenSize: { w: screenW, h: screenH },
          windowId: windowId || null,
        }, null, 2);

        // Return both image and location metadata as ContentResult
        return {
          content: [
            { type: "text" as const, text: `Window Location:\n${locationInfo}` },
            img,
          ],
        };
      }

      return img;
    } finally {
      try {
        require("fs").unlinkSync(filePath);
      } catch {
        // Best-effort cleanup
      }
    }
  },
});

// Tool 37: Window Tiling
server.addTool({
  name: "windowTiling",
  description:
    "Tile/arrange application windows on screen. Snap to halves, quarters, or set exact position and size.",
  parameters: z.object({
    appName: z
      .string()
      .describe("Application name to tile"),
    position: z
      .enum([
        "left-half",
        "right-half",
        "top-half",
        "bottom-half",
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
        "center",
        "maximize",
        "custom",
      ])
      .describe("Preset position or 'custom' for exact coordinates"),
    x: z.number().optional().describe("X coordinate (for custom position)"),
    y: z.number().optional().describe("Y coordinate (for custom position)"),
    width: z.number().optional().describe("Width (for custom position)"),
    height: z.number().optional().describe("Height (for custom position)"),
  }),
  execute: async ({ appName, position, x, y, width, height }) => {
    const escApp = escapeForAppleScript(appName);

    // Get screen dimensions
    const screenBounds = runAppleScript(
      'tell application "Finder" to get bounds of window of desktop'
    );
    const [, , screenW, screenH] = screenBounds.split(", ").map(Number);

    // Menu bar height offset
    const menuBarH = 25;
    const usableH = screenH - menuBarH;

    let targetX: number, targetY: number, targetW: number, targetH: number;

    switch (position) {
      case "left-half":
        [targetX, targetY, targetW, targetH] = [0, menuBarH, Math.floor(screenW / 2), usableH];
        break;
      case "right-half":
        [targetX, targetY, targetW, targetH] = [Math.floor(screenW / 2), menuBarH, Math.floor(screenW / 2), usableH];
        break;
      case "top-half":
        [targetX, targetY, targetW, targetH] = [0, menuBarH, screenW, Math.floor(usableH / 2)];
        break;
      case "bottom-half":
        [targetX, targetY, targetW, targetH] = [0, menuBarH + Math.floor(usableH / 2), screenW, Math.floor(usableH / 2)];
        break;
      case "top-left":
        [targetX, targetY, targetW, targetH] = [0, menuBarH, Math.floor(screenW / 2), Math.floor(usableH / 2)];
        break;
      case "top-right":
        [targetX, targetY, targetW, targetH] = [Math.floor(screenW / 2), menuBarH, Math.floor(screenW / 2), Math.floor(usableH / 2)];
        break;
      case "bottom-left":
        [targetX, targetY, targetW, targetH] = [0, menuBarH + Math.floor(usableH / 2), Math.floor(screenW / 2), Math.floor(usableH / 2)];
        break;
      case "bottom-right":
        [targetX, targetY, targetW, targetH] = [Math.floor(screenW / 2), menuBarH + Math.floor(usableH / 2), Math.floor(screenW / 2), Math.floor(usableH / 2)];
        break;
      case "center":
        targetW = Math.floor(screenW * 0.6);
        targetH = Math.floor(usableH * 0.7);
        targetX = Math.floor((screenW - targetW) / 2);
        targetY = menuBarH + Math.floor((usableH - targetH) / 2);
        break;
      case "maximize":
        [targetX, targetY, targetW, targetH] = [0, menuBarH, screenW, usableH];
        break;
      case "custom":
        if (x === undefined || y === undefined || width === undefined || height === undefined) {
          throw new Error("x, y, width, and height are required for custom position");
        }
        [targetX, targetY, targetW, targetH] = [x, y, width, height];
        break;
      default:
        throw new Error(`Unknown position: ${position}`);
    }

    // Activate app first, then set position and size
    runAppleScript(`tell application "${escApp}" to activate`);
    runAppleScript(
      `tell application "System Events" to tell process "${escApp}"
        set position of window 1 to {${targetX}, ${targetY}}
        set size of window 1 to {${targetW}, ${targetH}}
      end tell`
    );

    return `Tiled "${appName}" to ${position}: (${targetX}, ${targetY}) ${targetW}x${targetH}`;
  },
});

// Tool 38: Port Check
server.addTool({
  name: "portCheck",
  description:
    "Check if a network port is in use, what process owns it, or list all listening ports. Useful for verifying dev servers and checking port conflicts.",
  parameters: z.object({
    action: z
      .enum(["check", "list"])
      .describe("'check' a specific port, or 'list' all listening ports"),
    port: z
      .number()
      .min(1)
      .max(65535)
      .optional()
      .describe("Port number to check (required for 'check' action)"),
    protocol: z
      .enum(["tcp", "udp", "both"])
      .optional()
      .default("tcp")
      .describe("Protocol to check (default: tcp)"),
  }),
  execute: async ({ action, port, protocol }) => {
    const { execFileSync } = child_process;

    if (action === "check") {
      if (!port) throw new Error("port is required for 'check' action");

      try {
        const output = execFileSync(
          "lsof",
          ["-i", `${protocol === "udp" ? "UDP" : protocol === "both" ? "" : "TCP"}:${port}`, "-P", "-n"],
          { encoding: "utf-8", timeout: 10000 }
        );
        const lines = output.trim().split("\n");
        if (lines.length <= 1) {
          return `Port ${port} is free (not in use).`;
        }
        return `Port ${port} is IN USE:\n${lines.join("\n")}`;
      } catch (e: any) {
        // lsof returns exit code 1 when no matches found
        if (e.status === 1) {
          return `Port ${port} is free (not in use).`;
        }
        throw new Error(`Port check failed: ${e.message}`);
      }
    }

    if (action === "list") {
      const results: string[] = [];
      // TCP listening ports
      if (protocol === "tcp" || protocol === "both") {
        try {
          const output = execFileSync("lsof", ["-iTCP", "-P", "-n", "-sTCP:LISTEN"], {
            encoding: "utf-8",
            timeout: 10000,
          });
          results.push(output.trim());
        } catch (e: any) {
          if (e.status !== 1) throw new Error(`TCP port list failed: ${e.message}`);
        }
      }
      // UDP ports (no LISTEN state for UDP)
      if (protocol === "udp" || protocol === "both") {
        try {
          const output = execFileSync("lsof", ["-iUDP", "-P", "-n"], {
            encoding: "utf-8",
            timeout: 10000,
          });
          results.push(output.trim());
        } catch (e: any) {
          if (e.status !== 1) throw new Error(`UDP port list failed: ${e.message}`);
        }
      }
      if (results.length === 0) return "No listening ports found.";
      const merged = results.join("\n");
      const lines = merged.split("\n");
      return `Listening ports (${lines.length - 1} entries):\n${merged}`;
    }

    throw new Error("Invalid action");
  },
});

// Tool 39: File Watcher
server.addTool({
  name: "fileWatcher",
  description:
    "Watch a file or directory for changes. Blocks until a change is detected or timeout expires. Useful for waiting for build output, log updates, or file creation.",
  parameters: z.object({
    path: z.string().describe("File or directory path to watch"),
    timeoutSeconds: z
      .number()
      .min(1)
      .max(300)
      .optional()
      .default(30)
      .describe("Timeout in seconds (default 30, max 300)"),
    event: z
      .enum(["any", "create", "modify", "delete"])
      .optional()
      .default("any")
      .describe("Type of change to watch for (default: any)"),
  }),
  execute: async ({ path: watchPath, timeoutSeconds, event }) => {
    const { execFileSync } = child_process;
    const resolved = path.resolve(watchPath);
    const fs = require("fs");

    // Check if path exists (for create, we watch the parent)
    const watchTarget = event === "create" && !fs.existsSync(resolved)
      ? path.dirname(resolved)
      : resolved;

    if (!fs.existsSync(watchTarget)) {
      throw new Error(`Path does not exist: ${watchTarget}`);
    }

    // Get initial state
    const getState = (p: string) => {
      try {
        const stat = fs.statSync(p);
        return { exists: true, mtime: stat.mtimeMs, size: stat.size };
      } catch {
        return { exists: false, mtime: 0, size: 0 };
      }
    };

    let lastState = getState(resolved);
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds! * 1000;
    let sawDelete = false;

    // Poll for changes
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 250)); // 250ms poll interval

      const currentState = getState(resolved);

      let changed = false;
      let changeType = "";

      // Track delete-then-create for "create" event on pre-existing files
      if (!currentState.exists && lastState.exists) {
        sawDelete = true;
      }

      if (event === "create" || event === "any") {
        // Fires if: file didn't exist initially and now does, OR was deleted and recreated
        if ((!lastState.exists || sawDelete) && currentState.exists && sawDelete) {
          changed = true;
          changeType = "created";
        } else if (!lastState.exists && currentState.exists) {
          changed = true;
          changeType = "created";
        }
      }
      if (event === "delete" || event === "any") {
        if (lastState.exists && !currentState.exists) {
          changed = true;
          changeType = "deleted";
        }
      }
      if (event === "modify" || event === "any") {
        if (
          currentState.exists &&
          lastState.exists &&
          (currentState.mtime !== lastState.mtime ||
            currentState.size !== lastState.size)
        ) {
          changed = true;
          changeType = "modified";
        }
      }

      if (changed) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        return `File ${changeType}: ${resolved} (detected in ${elapsed}s). Size: ${currentState.size} bytes.`;
      }

      lastState = currentState;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return `Timeout after ${elapsed}s — no ${event === "any" ? "" : event + " "}changes detected on: ${resolved}`;
  },
});

// Tool 40: Quick Look
server.addTool({
  name: "quickLook",
  description:
    "Preview a file using macOS Quick Look (the spacebar preview). Opens a temporary preview window. Useful for verifying generated files (PDFs, images, documents).",
  parameters: z.object({
    filePath: z.string().describe("Path to the file to preview"),
    seconds: z
      .number()
      .min(1)
      .max(30)
      .optional()
      .default(5)
      .describe("How many seconds to show the preview (default 5, max 30)"),
  }),
  execute: async ({ filePath, seconds }) => {
    const { execFileSync, spawn } = child_process;
    const resolved = path.resolve(filePath);
    const fs = require("fs");

    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }

    // Get file info
    const stat = fs.statSync(resolved);
    const ext = path.extname(resolved);
    const sizeKB = (stat.size / 1024).toFixed(1);

    // Launch Quick Look in background, then kill after timeout
    const ql = spawn("qlmanage", ["-p", resolved], {
      stdio: "ignore",
      detached: true,
    });
    ql.unref();

    // Wait then kill
    await new Promise((resolve) => setTimeout(resolve, seconds! * 1000));
    try {
      process.kill(ql.pid!, "SIGTERM");
    } catch {}

    return `Quick Look preview shown for ${seconds}s: ${path.basename(resolved)} (${ext}, ${sizeKB} KB)`;
  },
});

// Tool 41: Spotlight Search
server.addTool({
  name: "spotlightSearch",
  description:
    "Search for files using macOS Spotlight (mdfind). Faster than recursive filesystem search for indexed locations. Supports filename search, content search, and metadata queries.",
  parameters: z.object({
    query: z.string().describe("Search query"),
    searchType: z
      .enum(["name", "content", "query"])
      .optional()
      .default("name")
      .describe(
        "'name' searches filenames, 'content' searches file contents, 'query' uses raw mdfind query syntax"
      ),
    directory: z
      .string()
      .optional()
      .describe("Limit search to this directory"),
    maxResults: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe("Maximum results to return (default 20)"),
  }),
  execute: async ({ query, searchType, directory, maxResults }) => {
    const { execFileSync } = child_process;
    const args: string[] = [];

    if (searchType === "name") {
      args.push("-name", query);
    } else if (searchType === "content") {
      // Explicit content predicate for file contents search
      const escaped = query
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\*/g, "\\*")
        .replace(/'/g, "\\'");
      args.push(`kMDItemTextContent == "*${escaped}*"cd`);
    } else {
      // Raw mdfind query syntax (e.g., "kMDItemKind == 'PDF Document'")
      args.push(query);
    }

    if (directory) {
      args.push("-onlyin", path.resolve(directory));
    }

    try {
      const output = execFileSync("mdfind", args, {
        encoding: "utf-8",
        timeout: 15000,
      });

      const results = output.trim().split("\n").filter(Boolean);
      const total = results.length;
      const limited = results.slice(0, maxResults!);

      if (total === 0) {
        return `No results found for "${query}".`;
      }

      let response = `Found ${total} result(s)${total > maxResults! ? ` (showing first ${maxResults})` : ""}:\n`;
      response += limited.join("\n");
      return response;
    } catch (e: any) {
      throw new Error(`Spotlight search failed: ${e.message}`);
    }
  },
});

// Tool 42: Pasteboard Types
server.addTool({
  name: "pasteboardInfo",
  description:
    "Get detailed information about clipboard contents including data types (text, HTML, RTF, image, file URLs). Useful for verifying copy operations include the right formats.",
  parameters: z.object({}),
  execute: async () => {
    // Get pasteboard types via AppleScript
    const types = runAppleScript(
      'tell application "System Events" to get (clipboard info) as text'
    );

    // Also get plain text content length
    let textPreview = "";
    try {
      const { execFileSync } = child_process;
      const text = execFileSync("pbpaste", {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (text.length > 0) {
        const preview = text.substring(0, 200);
        textPreview = `\n\nText preview (${text.length} chars):\n${preview}${text.length > 200 ? "..." : ""}`;
      }
    } catch {}

    return `Clipboard formats:\n${types}${textPreview}`;
  },
});

// Tool 43: Screen Recording
server.addTool({
  name: "screenRecording",
  description:
    "Start or stop a macOS screen recording. Recordings are saved as .mov files. Useful for capturing test evidence or demo recordings.",
  parameters: z.object({
    action: z
      .enum(["start", "stop", "status"])
      .describe("Action to perform"),
    outputPath: z
      .string()
      .optional()
      .describe(
        "Output file path for recording (default: ~/Desktop/recording-{timestamp}.mov)"
      ),
    duration: z
      .number()
      .min(1)
      .max(300)
      .optional()
      .describe("Auto-stop after N seconds (optional, max 300)"),
    audioEnabled: z
      .boolean()
      .optional()
      .default(false)
      .describe("Record system audio (default: false)"),
  }),
  execute: async ({ action, outputPath, duration, audioEnabled }) => {
    const { execFileSync, spawn } = child_process;
    const fs = require("fs");
    const pidFile = `/tmp/mcp-record-${process.env.USER || "default"}.pid`;

    // Helper: verify PID is actually screencapture (not a reused PID)
    const isScreencapturePid = (pid: string): boolean => {
      try {
        process.kill(parseInt(pid), 0); // Check if alive
        const psOut = execFileSync("ps", ["-p", pid, "-o", "comm="], {
          encoding: "utf-8",
          timeout: 3000,
        }).trim();
        return psOut.includes("screencapture");
      } catch {
        return false;
      }
    };

    if (action === "status") {
      if (fs.existsSync(pidFile)) {
        const pid = fs.readFileSync(pidFile, "utf-8").trim();
        if (isScreencapturePid(pid)) {
          return `Screen recording is active (PID: ${pid}).`;
        }
        fs.unlinkSync(pidFile);
      }
      return "No active screen recording.";
    }

    if (action === "stop") {
      if (!fs.existsSync(pidFile)) {
        return "No active screen recording to stop.";
      }
      const pid = fs.readFileSync(pidFile, "utf-8").trim();
      try {
        // screencapture responds to SIGINT to finalize the recording
        process.kill(parseInt(pid), "SIGINT");
        fs.unlinkSync(pidFile);
        // Wait a moment for file finalization
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return `Screen recording stopped (PID: ${pid}). File is being finalized.`;
      } catch (e: any) {
        try { fs.unlinkSync(pidFile); } catch {}
        return `Recording process ${pid} not found (may have already stopped).`;
      }
    }

    if (action === "start") {
      // Check for existing recording — verify it's actually screencapture
      if (fs.existsSync(pidFile)) {
        const existingPid = fs.readFileSync(pidFile, "utf-8").trim();
        if (isScreencapturePid(existingPid)) {
          return `A recording is already active (PID: ${existingPid}). Stop it first.`;
        }
        // Stale PID file — clean up
        fs.unlinkSync(pidFile);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
      const outFile = outputPath
        ? path.resolve(outputPath)
        : path.join(os.homedir(), "Desktop", `recording-${timestamp}.mov`);

      const args = ["-v"]; // -v = video recording
      if (audioEnabled) args.push("-g"); // -g = capture audio from default input
      if (duration) args.push("-V", String(duration)); // -V = timed capture (screencapture manages duration)
      args.push(outFile);

      const proc = spawn("screencapture", args, {
        stdio: "ignore",
        detached: true,
      });
      proc.unref();

      if (proc.pid) {
        fs.writeFileSync(pidFile, String(proc.pid));

        return `Screen recording started (PID: ${proc.pid}). Output: ${outFile}${duration ? `. Auto-stops after ${duration}s (managed by screencapture -V).` : ". Use action='stop' to finish."}`;
      }
      throw new Error("Failed to start screen recording.");
    }

    throw new Error("Invalid action");
  },
});

// Tool 44: Defaults Control
server.addTool({
  name: "defaultsControl",
  description:
    "Read or write macOS user defaults (plist preferences). Useful for toggling app settings, checking config values, or setting test preferences.",
  parameters: z.object({
    action: z
      .enum(["read", "write", "delete", "domains"])
      .describe("Action to perform"),
    domain: z
      .string()
      .optional()
      .describe(
        "Preference domain (e.g., 'com.apple.finder', 'NSGlobalDomain'). Required for read/write/delete."
      ),
    key: z
      .string()
      .optional()
      .describe("Preference key (omit to read all keys in domain)"),
    value: z
      .string()
      .optional()
      .describe("Value to write (required for 'write' action)"),
    valueType: z
      .enum(["string", "int", "float", "bool", "array-add"])
      .optional()
      .default("string")
      .describe("Value type for write (default: string)"),
  }),
  execute: async ({ action, domain, key, value, valueType }) => {
    const { execFileSync } = child_process;

    if (action === "domains") {
      const output = execFileSync("defaults", ["domains"], {
        encoding: "utf-8",
        timeout: 10000,
      });
      const domains = output.trim().split(", ");
      return `Preference domains (${domains.length}):\n${domains.sort().join("\n")}`;
    }

    if (!domain) throw new Error("domain is required for read/write/delete");

    if (action === "read") {
      try {
        const args = key ? ["read", domain, key] : ["read", domain];
        const output = execFileSync("defaults", args, {
          encoding: "utf-8",
          timeout: 10000,
        });
        return key
          ? `${domain} ${key} = ${output.trim()}`
          : `${domain} defaults:\n${output.trim()}`;
      } catch (e: any) {
        if (e.message.includes("does not exist")) {
          return `Key "${key}" does not exist in domain "${domain}".`;
        }
        throw new Error(`Defaults read failed: ${e.message}`);
      }
    }

    if (action === "write") {
      if (!key) throw new Error("key is required for write");
      if (value === undefined) throw new Error("value is required for write");

      const typeFlag =
        valueType === "int" ? "-int"
        : valueType === "float" ? "-float"
        : valueType === "bool" ? "-bool"
        : valueType === "array-add" ? "-array-add"
        : "-string";

      execFileSync("defaults", ["write", domain, key, typeFlag, value], {
        encoding: "utf-8",
        timeout: 5000,
      });
      return `Set ${domain} ${key} = ${value} (${valueType})`;
    }

    if (action === "delete") {
      if (!key) throw new Error("key is required for delete");
      try {
        execFileSync("defaults", ["delete", domain, key], {
          encoding: "utf-8",
          timeout: 5000,
        });
        return `Deleted ${domain} ${key}`;
      } catch (e: any) {
        return `Key "${key}" not found in "${domain}".`;
      }
    }

    throw new Error("Invalid action");
  },
});

// Tool 45: Network Diagnostics
server.addTool({
  name: "networkDiagnostics",
  description:
    "Network diagnostic utilities: ping a host, DNS lookup, check HTTP endpoint, or get network interfaces. Useful for verifying API endpoints before integration tests.",
  parameters: z.object({
    action: z
      .enum(["ping", "dns", "http", "interfaces"])
      .describe("Diagnostic action to perform"),
    host: z
      .string()
      .optional()
      .describe("Hostname or IP (required for ping, dns, http)"),
    count: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(3)
      .describe("Ping count (default 3, max 10)"),
    timeout: z
      .number()
      .min(1)
      .max(30)
      .optional()
      .default(5)
      .describe("Timeout in seconds (default 5)"),
  }),
  execute: async ({ action, host, count, timeout }) => {
    const { execFileSync } = child_process;

    if (action === "ping") {
      if (!host) throw new Error("host is required for ping");
      try {
        const output = execFileSync(
          "ping",
          ["-c", String(count), "-W", String(timeout! * 1000), host],
          { encoding: "utf-8", timeout: (timeout! + 5) * 1000 }
        );
        return `Ping ${host}:\n${output.trim()}`;
      } catch (e: any) {
        return `Ping ${host} failed:\n${e.stdout || e.message}`;
      }
    }

    if (action === "dns") {
      if (!host) throw new Error("host is required for dns");
      try {
        const output = execFileSync(
          "dig",
          ["+short", host],
          { encoding: "utf-8", timeout: timeout! * 1000 }
        );
        const records = output.trim();
        if (!records) return `No DNS records found for ${host}.`;
        return `DNS lookup ${host}:\n${records}`;
      } catch (e: any) {
        // Fallback to host command
        try {
          const output = execFileSync("host", [host], {
            encoding: "utf-8",
            timeout: timeout! * 1000,
          });
          return `DNS lookup ${host}:\n${output.trim()}`;
        } catch {
          throw new Error(`DNS lookup failed: ${e.message}`);
        }
      }
    }

    if (action === "http") {
      if (!host) throw new Error("host is required for http");
      const url = host.startsWith("http") ? host : `https://${host}`;
      try {
        const output = execFileSync(
          "curl",
          [
            "-sS",
            "-o", "/dev/null",
            "-w", "HTTP %{http_code} | %{time_total}s | %{size_download} bytes | %{remote_ip}",
            "--max-time", String(timeout),
            url,
          ],
          { encoding: "utf-8", timeout: (timeout! + 5) * 1000 }
        );
        return `HTTP check ${url}:\n${output.trim()}`;
      } catch (e: any) {
        return `HTTP check ${url} failed:\n${e.stdout || e.stderr || e.message}`;
      }
    }

    if (action === "interfaces") {
      try {
        const output = execFileSync("ifconfig", {
          encoding: "utf-8",
          timeout: 5000,
        });
        // Parse to show just interface names and IPs
        const lines = output.split("\n");
        const summary: string[] = [];
        let currentIface = "";
        for (const line of lines) {
          const ifaceMatch = line.match(/^(\w+):/);
          if (ifaceMatch) currentIface = ifaceMatch[1];
          const inetMatch = line.match(/inet\s+([\d.]+)/);
          if (inetMatch && currentIface) {
            summary.push(`${currentIface}: ${inetMatch[1]}`);
          }
        }
        return `Network interfaces:\n${summary.join("\n") || "No interfaces found"}`;
      } catch (e: any) {
        throw new Error(`Failed to list interfaces: ${e.message}`);
      }
    }

    throw new Error("Invalid action");
  },
});

// Parse command line arguments
const args = process.argv.slice(2);
const useStdio = args.includes("--stdio");
const useHttp = args.includes("--sse") || !useStdio; // Default to HTTP/SSE if no flag specified

// Start the MCP server with the specified transport
if (useStdio) {
  server.start({
    transportType: "stdio",
  });
  console.log(`🚀 MCP Server started with stdio transport`);
} else {
  // Use HTTP streaming transport (which supports SSE)
  server.start({
    transportType: "httpStream",
    httpStream: { port: 3010 },
  });
  console.log(
    `🚀 MCP Server started with HTTP streaming transport on http://localhost:3010/stream`
  );
}

console.log(`📋 nutjs available: ${nutjsAvailable}`);
console.log(`🔐 Permissions available: ${permissionsAvailable}`);
