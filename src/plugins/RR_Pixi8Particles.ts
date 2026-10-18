import type {
  Particle,
  ParticleContainer,
  Ticker,
} from "pixi.js";

interface ParticleEntry {
  particle: Particle;
  vx: number;
  vy: number;
  phase: number;
}

interface DemoState {
  layer: ParticleContainer;
  particles: ParticleEntry[];
  tick: (ticker: Ticker) => void;
}

(() => {
  "use strict";

  const PLUGIN_NAME = "RR_Pixi8Particles";

  let state: DemoState | null = null;

  function stop(): void {
    if (!state) {
      return;
    }

    if (Graphics.app?.ticker && state.tick) {
      Graphics.app.ticker.remove(state.tick);
    }

    if (state.layer.parent) {
      state.layer.parent.removeChild(state.layer);
    }

    state.layer.destroy();

    state = null;

    console.log("[RR_Pixi8Particles] stopped");
  }

  function start(rawCount: string | number | undefined): void {
    stop();

    const app = Graphics.app;
    if (!app) {
      throw new Error("Graphics.app is not initialized.");
    }

    if (typeof RPG_REACTOR_RUNTIME_REVISION === "undefined") {
      throw new Error(
        "This demo requires the RPG Reactor runtime.",
      );
    }

    if (typeof PIXI === "undefined") {
      throw new Error("PIXI global not found.");
    }

    /*
     * RPG Reactor exposes the real PixiJS 8 ParticleContainer here.
     *
     * The public PIXI.ParticleContainer name is compatibility-shimmed
     * for older RPG Maker plugins, so for this demo we deliberately
     * request Reactor's native PixiJS 8 implementation.
     */
    const NativeParticleContainer =
      PIXI.__v8ParticleContainer;

    if (!NativeParticleContainer) {
      throw new Error(
        "Native PixiJS 8 ParticleContainer was not found.",
      );
    }

    if (!PIXI.Particle) {
      throw new Error(
        "PIXI.Particle was not found. This is not the expected PixiJS 8 runtime.",
      );
    }

    const count = Math.max(
      100,
      Math.min(5000, Number(rawCount) || 1500),
    );

    const layer = new NativeParticleContainer({
      dynamicProperties: {
        position: true,
        vertex: true,
        color: true,
      },
    });

    layer.blendMode = "add";

    const particles: ParticleEntry[] = [];

    for (let i = 0; i < count; i++) {
      const particle = new PIXI.Particle({
        texture: PIXI.Texture.WHITE,
        anchorX: 0.5,
        anchorY: 0.5,
      });

      const scale = 6 + Math.random() * 14;

      particle.x = Math.random() * Graphics.width;
      particle.y = Math.random() * Graphics.height;

      particle.scaleX = scale;
      particle.scaleY = scale;

      particle.alpha = 0.2 + Math.random() * 0.8;

      particle.tint =
        Math.random() > 0.5
          ? 0xbbeeff
          : 0xffffff;

      layer.addParticle(particle);

      particles.push({
        particle,
        vx: -0.4 + Math.random() * 0.8,
        vy: 0.7 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const scene = SceneManager._scene;

    if (!scene) {
      layer.destroy();

      throw new Error(
        "SceneManager._scene is not available.",
      );
    }

    /*
     * Add directly to the current RPG Maker scene.
     * This intentionally keeps the demo tiny.
     */
    scene.addChild(layer);

    const tick = (ticker: Ticker): void => {
      const dt = ticker.deltaTime || 1;

      for (const entry of particles) {
        const p = entry.particle;

        p.y += entry.vy * dt;

        p.x += (
          entry.vx +
          Math.sin(
            p.y * 0.012 +
            entry.phase,
          ) * 0.35
        ) * dt;

        if (p.y > Graphics.height + 16) {
          p.y = -16;
          p.x = Math.random() * Graphics.width;
        }

        if (p.x < -16) {
          p.x = Graphics.width + 16;
        } else if (p.x > Graphics.width + 16) {
          p.x = -16;
        }
      }
    };

    app.ticker.add(tick);

    state = {
      layer,
      particles,
      tick,
    };

    console.log(
      "[RR_Pixi8Particles] started",
      {
        particleCount: count,
        pixiVersion: PIXI.VERSION,
        reactorRevision:
          RPG_REACTOR_RUNTIME_REVISION,
        containerClass:
          NativeParticleContainer.name,
        nwVersion:
          typeof process !== "undefined"
            ? process.versions?.nw
            : undefined,
      },
    );
  }

  PluginManager.registerCommand(
    PLUGIN_NAME,
    "Start",
    (args) => {
      start(args.count);
    },
  );

  PluginManager.registerCommand(
    PLUGIN_NAME,
    "Stop",
    () => {
      stop();
    },
  );

  const sceneMapTerminate =
    Scene_Map.prototype.terminate;

  Scene_Map.prototype.terminate = function (): void {
    stop();
    sceneMapTerminate.call(this);
  };
})();

export {};
