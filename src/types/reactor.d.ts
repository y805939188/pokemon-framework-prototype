declare global {
  const RPG_REACTOR_RUNTIME_REVISION: string;

  /**
   * NW.js exposes Node's process global inside the game runtime.
   * Only declare the tiny surface our host adapter/demo currently needs.
   */
  const process: {
    versions?: {
      nw?: string;
      node?: string;
      chromium?: string;
      [key: string]: string | undefined;
    };
    arch?: string;
  };
}

export {};
