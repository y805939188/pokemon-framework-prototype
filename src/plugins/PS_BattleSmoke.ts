/**
 * Step 2.1 smoke plugin. Loads js/engine/harness.cjs (the same module the Node gate uses)
 * from the game directory resolved at runtime, runs all checks, writes a JSON report and
 * shows a PASS/FAIL overlay. No battle UI: this only proves the engine loads and behaves
 * identically inside the NW.js runtime.
 */
interface NwApp {
  argv: string[];
  dataPath: string;
  quit(): void;
}
declare const nw: { App: NwApp } | undefined;
type NodeRequire = ((id: string) => unknown) & { resolve(id: string): string };

interface SmokeCheck { id: string; status: string; error?: string; detail?: unknown }
interface SmokeReport { overall: string; checks: SmokeCheck[]; env: Record<string, unknown> }
interface Harness { runSmoke(extra?: Record<string, unknown>): Promise<SmokeReport> }
interface NodeFs {
  mkdirSync(p: string, o?: { recursive: boolean }): void;
  writeFileSync(p: string, d: string): void;
}

(() => {
  "use strict";

  const PLUGIN_NAME = "PS_BattleSmoke";
  // Fetch NW.js's Node require() off globalThis. A bare `require(...)` would be rewritten by the
  // bundler into a browser-external shim, which silently breaks Node built-ins like "path".
  const nodeRequire = (globalThis as unknown as { require?: NodeRequire }).require;
  const params = PluginManager.parameters(PLUGIN_NAME) as Record<string, string>;
  let started = false;

  // The page URL is chrome-extension://..., so the game directory comes from Node's
  // resolver (relative to index.html) at runtime; nothing absolute is baked into the build.
  const HARNESS = "./js/engine/harness.cjs";
  function harnessPath(): string {
    if (!nodeRequire) throw new Error("Node require() is not available in this runtime");
    return nodeRequire.resolve(HARNESS);
  }
  function gameDir(): string {
    const nodePath = nodeRequire!("path") as { dirname(p: string): string };
    return nodePath.dirname(nodePath.dirname(nodePath.dirname(harnessPath()))) + "/";
  }

  function argValue(name: string): string | undefined {
    const argv = (typeof nw !== "undefined" && nw?.App.argv) || [];
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  }
  function hasFlag(name: string): boolean {
    const argv = (typeof nw !== "undefined" && nw?.App.argv) || [];
    return argv.includes(`--${name}`);
  }

  function writeReport(report: SmokeReport): string {
    const fs = nodeRequire!("fs") as NodeFs;
    const path = nodeRequire!("path") as { join(...p: string[]): string; dirname(p: string): string };
    const json = JSON.stringify(report, null, 2);
    const candidates = [
      argValue("ps-smoke-out"),
      path.join(gameDir(), "save", "ps-smoke-result.json"),
      typeof nw !== "undefined" && nw ? path.join(nw.App.dataPath, "ps-smoke-result.json") : undefined,
    ].filter((x): x is string => !!x);
    const errors: string[] = [];
    for (const target of candidates) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, json);
        return target;
      } catch (e) {
        errors.push(`${target}: ${String(e)}`);
      }
    }
    throw new Error("could not write report: " + errors.join("; "));
  }

  function overlay(text: string, ok: boolean): void {
    const div = document.createElement("pre");
    div.id = "ps-smoke-overlay";
    div.textContent = text;
    div.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:99999;margin:0;padding:8px;" +
      `background:rgba(0,0,0,.8);color:${ok ? "#7f7" : "#f77"};font:12px monospace;white-space:pre-wrap;max-width:90vw`;
    document.body.appendChild(div);
  }

  async function run(): Promise<void> {
    if (started) return;
    started = true;
    let report: SmokeReport;
    try {
      const harness = nodeRequire!(HARNESS) as Harness;
      if (!harness) throw new Error("harness not loaded");
      const t0 = performance.now();
      report = await harness.runSmoke({
        nwjs: process.versions?.nw,
        userAgent: navigator.userAgent,
        href: location.href,
        elapsedMs: Math.round(performance.now() - t0),
      });
      report.env.totalMs = Math.round(performance.now() - t0);
    } catch (e) {
      report = {
        overall: "fail",
        checks: [{ id: "load", status: "fail", error: String(e instanceof Error ? e.stack : e) }],
        env: { processVersions: typeof process !== "undefined" ? process.versions : null, href: location.href },
      };
    }
    let where = "(not written)";
    try {
      where = writeReport(report);
    } catch (e) {
      where = String(e);
    }
    const summary =
      `PS smoke: ${report.overall.toUpperCase()}\n` +
      report.checks.map((c) => `  ${c.status}  ${c.id}${c.error ? "  " + c.error.split("\n")[0] : ""}`).join("\n") +
      `\nreport: ${where}`;
    console.log(summary);
    overlay(summary, report.overall === "pass");
    if (hasFlag("ps-smoke-quit") && typeof nw !== "undefined" && nw) {
      setTimeout(() => nw.App.quit(), 500);
    }
  }

  const bootStart = Scene_Boot.prototype.start;
  Scene_Boot.prototype.start = function (this: Scene_Boot) {
    bootStart.call(this);
    if (params.runOnBoot !== "false" || argValue("ps-smoke-out") !== undefined) void run();
  };

  PluginManager.registerCommand(PLUGIN_NAME, "Run", () => {
    started = false;
    void run();
  });
})();
