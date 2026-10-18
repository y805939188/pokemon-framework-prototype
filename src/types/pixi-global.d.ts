type PixiModule = typeof import("pixi.js");

declare global {
  const PIXI: PixiModule & {
    /**
     * RPG Reactor 暴露的原生 PixiJS 8 ParticleContainer。
     * 公共 PIXI.ParticleContainer 可能经过兼容层处理。
     */
    __v8ParticleContainer: PixiModule["ParticleContainer"];
  };
}

export {};
