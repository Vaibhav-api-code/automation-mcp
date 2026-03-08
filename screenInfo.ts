import { FastMCP, imageContent } from "fastmcp";
import { z } from "zod";
import * as child_process from "child_process";

export const screenInfo = async (nutjsAvailable: boolean) => {
  if (nutjsAvailable) {
    try {
      const nutjs = require("./nutjs/nut.js/core/nut.js/dist/index.js");
      const { screen } = nutjs;
      const width = await screen.width();
      const height = await screen.height();
      return `Screen dimensions: ${width}x${height} pixels`;
    } catch (e) {
      // Fallback to system command
    }
  }

  // Fallback method using system_profiler (no shell pipe)
  try {
    const output = child_process
      .execFileSync("system_profiler", ["SPDisplaysDataType"], {
        encoding: "utf-8",
        timeout: 10000,
      });
    const match = output.match(/(\d+) x (\d+)/);
    if (match) {
      return `Screen dimensions: ${match[1]}x${match[2]} pixels`;
    }
  } catch (e) {
    // Another fallback
  }

  return "Screen dimensions unavailable (nutjs not fully loaded)";
};
