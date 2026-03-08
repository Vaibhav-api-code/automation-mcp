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
console.error = () => {}; // Suppress all error logs from FastMCP
console.warn = () => {}; // Suppress all warning logs from FastMCP

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
        child_process.execSync(`screencapture -x -D1 "${filePath}"`);
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
        child_process.execSync(
          `screencapture -x -R${regionX},${regionY},${regionWidth},${regionHeight} "${filePath}"`
        );
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
        child_process.execSync(`screencapture -x -l${targetId} "${filePath}"`);
      }

      if (!require("fs").existsSync(filePath)) {
        throw new Error(`Screenshot file was not created at ${filePath}`);
      }

      return await imageContent({ path: filePath });
    } catch (error: any) {}
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
          .execSync(
            `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`
          )
          .toString()
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
          child_process.execSync(
            `osascript -e 'tell application "${windowTitle}" to activate'`
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
        child_process.execSync(
          `osascript -e 'tell application "System Events" to ${script}'`
        );
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
    pid: z.number().optional().describe("Process ID to kill"),
    signal: z
      .enum(["TERM", "KILL"])
      .default("TERM")
      .describe("Signal to send: TERM (graceful) or KILL (force)"),
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
        // Return top 30 processes by default
        return `Running processes (top 30):\n${lines.slice(0, 31).join("\n")}`;
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
        // Kill by name using pkill with -x for exact match (prevents regex injection)
        const safeName = name!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        execFileSync("pkill", [sigFlag, "-x", safeName], {
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
      .default("default")
      .describe(
        "Sound name (e.g., 'default', 'Basso', 'Blow', 'Bottle', 'Frog', 'Funk', 'Glass', 'Hero', 'Morse', 'Ping', 'Pop', 'Purr', 'Sosumi', 'Submarine', 'Tink')"
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
    "Reads text from a screen region or image file using macOS Vision framework OCR. Specify a region {x, y, width, height} to capture and read from screen, or provide an imagePath to read from a file.",
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
      .describe("Timeout in milliseconds"),
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

        // Compare pixel data - read BMP header fields for correct pixel access
        const minLen = Math.min(baseline.length, current.length);
        const headerSize =
          baseline.length >= 14 ? baseline.readUInt32LE(10) : 54;
        // Read bits-per-pixel from BMP DIB header (bytes 28-29, LE uint16)
        const bpp =
          baseline.length >= 30 ? baseline.readUInt16LE(28) : 32;
        const bytesPerPixel = bpp / 8; // 3 for 24-bit, 4 for 32-bit
        const pixelLen = minLen - headerSize;
        if (pixelLen <= 0 || bytesPerPixel < 3) continue;

        let diffCount = 0;
        const totalSamples = Math.floor(pixelLen / bytesPerPixel);
        for (let i = headerSize; i < minLen - (bytesPerPixel - 1); i += bytesPerPixel) {
          if (
            baseline[i] !== current[i] ||
            baseline[i + 1] !== current[i + 1] ||
            baseline[i + 2] !== current[i + 2]
          ) {
            diffCount++;
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
    "Returns information about all connected displays including resolution, Retina scaling, and position. Useful for multi-monitor setups.",
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
