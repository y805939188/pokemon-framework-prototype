function typecheckRuntimeBindings(): void {
  const pixiVersion: string = PIXI.VERSION;
  const reactorRevision: string = RPG_REACTOR_RUNTIME_REVISION;

  const particleContainerConstructor = PIXI.__v8ParticleContainer;
  const particleConstructor = PIXI.Particle;

  const scene = SceneManager._scene;
  const width: number = Graphics.width;
  const height: number = Graphics.height;
  const ticker = Graphics.app?.ticker;

  const terminate = Scene_Map.prototype.terminate;

  // Exercise the installed declarations, including their negative contracts.
  const actor = $gameActors?.actor(1);
  actor?.gainHp(10);
  const rectangle = new Rectangle(0, 0, 320, 240);
  const commandWindow = new Window_Command(rectangle);
  PluginManager.registerCommand("TypeFixture", "Wait", function (args) {
    this.wait(Number(args.frames ?? "1"));
  });
  // @ts-expect-error Database globals are nullable before loading.
  $gameActors.actor(1);
  // @ts-expect-error Runtime APIs retain their parameter types.
  actor?.gainHp("10");

  void pixiVersion;
  void reactorRevision;
  void particleContainerConstructor;
  void particleConstructor;
  void scene;
  void width;
  void height;
  void ticker;
  void terminate;
  void commandWindow;
}

void typecheckRuntimeBindings;

export {};
