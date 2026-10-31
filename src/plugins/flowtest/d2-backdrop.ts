/* eslint-disable @typescript-eslint/no-explicit-any */
/** Explicit test mode only: real MZ command, local image decode, canvas/compositor pixels and owned cleanup. */
export async function runD2Backdrop(p: any): Promise<void> {
  const { G, W, scenario, toMap, fresh, inMode, battle, choose, frames, game, clone, finishBattle, shot, report, assert, eq } = p;
  report.d2Backdrop = { version: 'D2-backdrop-host-v1', cases: [] };
  let serial = 0;
  const begin = async (background: string, platform = '', time = '0') => {
    await toMap(); fresh();
    const args = {kind:'trainer',foes:'Pidgey:5,Pidgey:5',battleId:'D2-backdrop-'+(++serial),canLose:'true',resultVariable:'0',battleBackground:'__tests__/'+background,battlePlatform:platform,battleTime:time};
    G.$gameMap._interpreter.setup([{code:357,indent:0,parameters:['PS_BattleFlow','StartBattle','Start battle',args]},{code:0,indent:0,parameters:[]}],0);
    await inMode('main'); return battle();
  };
  const abort = async () => { const owned = battle(); W.PSFlow.abort(Error('D2 backdrop controlled cleanup')); await finishBattle(); eq(owned.battlebackState().cleanupErrors, [], 'owned image cleanup has no hidden error'); eq(owned.battlebackState().ownedAssets, 0, 'no retained delivered assets'); };
  const row = (s: any, role: string) => s.battlebackState().rows.find((x: any) => x.role === role);
  const record = (value: any) => { report.d2Backdrop.cases.push(value); return value; };
  await scenario('D2-B01 actual missing resources keep a usable owned scene with explicit code fallback', async () => {
    const s = await begin('pf_missing'), before = clone(game());
    assert(s.battlebackState().ready, 'fallback is a completed display decision'); assert(s.battlebackState().rows.every((r: any) => r.reason === 'missing'), 'all four missing identified');
    eq(s._backdrop.sprite.bitmap.getPixel(700,450),'#18232c','actual generated fallback pixel');
    assert(s.children.indexOf(s._backdrop.sprite)<s.children.indexOf(s._windowLayer),'surface is below actual windows');
    await choose(/^Fight/); await inMode('moves'); await p.press('cancel'); await inMode('main'); eq(game(),before,'image selection never installs game'); await shot('d2-backdrop-missing'); await abort(); return record({id:'D2-B01',fallback:true});
  });
  await scenario('D2-B02 actual PNG decode paints all four roles and changes the composed Scene pixels', async () => {
    const s = await begin('pf_backdrop','water','2'), before=clone(game()),surface=s._backdrop.sprite.bitmap;
    assert(s.battlebackState().rows.every((r:any)=>r.status==='ready'),'four real decodes'); assert(row(s,'background').path.endsWith('pf_backdrop_night_bg.png'),'night background selected'); assert(row(s,'message').path.endsWith('pf_backdrop_message.png'),'independent base message'); assert(row(s,'playerBase').path.endsWith('pf_backdrop_water_base0.png'),'combined base chosen without an invented timed prefix');
    eq([surface.getPixel(700,450),surface.getPixel(20,590),surface.getPixel(790,20),surface.getPixel(700,300)],['#1c3557','#236940','#844c1e','#482452'],'actual destination canvas role pixels');
    const sprite=s._backdrop.sprite;let visible:any=null,hidden:any=null;
    try { visible=G.Bitmap.snap(s);sprite.visible=false;await frames(1);hidden=G.Bitmap.snap(s);assert(visible.getPixel(700,340)!==hidden.getPixel(700,340),'real rendered Scene includes this surface through window background'); }
    finally {sprite.visible=true;visible?.destroy();hidden?.destroy();}
    await frames(1);await shot('d2-backdrop-loaded');eq(game(),before,'rendering did not persist');await abort();return record({id:'D2-B02',paths:s.battlebackState().rows,compositorChanged:true});
  });
  await scenario('D2-B03 actual PNG takes precedence over an available GIF at the same logical path', async () => {
    const s=await begin('pf_pngwins');assert(row(s,'background').path.endsWith('.png'),'PNG priority');eq(s._backdrop.sprite.bitmap.getPixel(700,450),'#9f2a26','actual PNG colour rather than GIF');await abort();return record({id:'D2-B03',pngFirst:true});
  });
  await scenario('D2-B04 actual GIF-only static image is decoded and drawn without a PNG assumption', async () => {
    const s=await begin('pf_gifonly');assert(row(s,'background').path.endsWith('.gif'),'GIF fallback');eq(row(s,'background').status,'ready','real GIF decoded');eq(s._backdrop.sprite.bitmap.getPixel(700,450),'#1758c7','actual GIF colour');await shot('d2-backdrop-gif');await abort();return record({id:'D2-B04',gifDecoded:true});
  });
  await scenario('D2-B05 corrupt local image becomes a declared fallback without a global image failure', async () => {
    const s=await begin('pf_corrupt');eq(row(s,'background').reason,'load-error','decode failure differs from missing');eq(s._backdrop.sprite.bitmap.getPixel(700,450),'#18232c','corrupt image fallback pixel');assert(s.inputState().ready,'normal input remains usable');await abort();return record({id:'D2-B05',decodeError:true});
  });
  await scenario('D2-B06 actual abort releases private bitmap and sprite; retired polling cannot repaint a successor', async () => {
    const old=await begin('pf_backdrop','water','2'),sprite=old._backdrop.sprite,surface=sprite.bitmap,before=clone(game());await abort();assert(sprite.destroyed,'private sprite destroyed');eq(surface.baseTexture,null,'private surface texture released');eq(old.battlebackState().ownedAssets,0,'all delivered assets released');assert(old.battlebackState().retired,'view retired');
    const next=await begin('pf_missing'),snapshot=clone(next.battlebackState());old._backdrop.poll();old._backdrop.dispose();eq(next.battlebackState(),snapshot,'late old view did not affect next owner');eq(game(),before,'controlled cancellation never installs');await abort();return record({id:'D2-B06',released:true,successorUntouched:true});
  });
}
