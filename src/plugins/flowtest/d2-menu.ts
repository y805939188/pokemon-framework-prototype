/* eslint-disable @typescript-eslint/no-explicit-any */
/** Actual MZ keys and menus; inert except in the explicit isolated d2-menu test mode. */
export async function runD2Menu(p: any): Promise<void> {
  const { W, scenario, toMap, fresh, startEvent, inMode, battle, choose, press, game, clone, finishBattle, shot, report } = p;
  report.d2Menu = { version: 'D2-menu-grid-host-v1', cases: [] };
  const begin = async (count = 4) => { await toMap(); fresh(); game().party[0].moves = game().party[0].moves.slice(0, count); await startEvent(2); await inMode('main'); return battle(); };
  const abort = async () => { W.PSFlow.abort(Error('D2 menu controlled cleanup')); await finishBattle(); };
  const record = (row: any) => { report.d2Menu.cases.push(row); return row; };
  await scenario('D2-M01 actual 2x2 command keys stop at edges without submitting a battle action', async () => {
    const s = await begin(), before = clone(game()), engine = s._session.gw.snapshot();
    p.eq(s.inputState().implementation, 'd2-menu-grid-v1', 'real menu implementation'); p.eq(s.inputState().columns, 2, 'actual two-column window');
    const route: any[] = [];
    for (const [key, index] of [['left',0],['up',0],['right',1],['right',1],['down',3],['down',3],['left',2],['left',2],['up',0]]) {
      await press(key); p.eq(s._menu.index(), index, 'actual key '+key); p.assert(s.inputState().ready, 'navigation stays ready'); route.push({key,index});
    }
    p.eq(s._session.gw.snapshot(), engine, 'directions submit no engine action'); p.eq(game(), before, 'directions never install game'); await shot('d2-grid-main'); await abort();
    return record({id:'D2-M01',route});
  });
  await scenario('D2-M02 actual command and move memories survive cancel and one-column bag navigation', async () => {
    const s = await begin(), before = clone(game()), engine = s._session.gw.snapshot();
    await choose(/^Fight/); await inMode('moves'); p.eq(s.inputState().columns,2,'moves use two columns'); await press('right'); await press('down'); p.eq(s._menu.index(),3,'fourth move selected'); await shot('d2-grid-moves');
    await press('cancel'); await inMode('main'); p.eq(s._menu.index(),0,'fight command remembered'); await choose(/^Fight/); await inMode('moves'); p.eq(s._menu.index(),3,'move remembered'); await press('cancel'); await inMode('main');
    await choose(/^Bag/); await inMode('bag'); p.eq(s.inputState().columns,1,'bag remains one column'); await press('cancel'); await inMode('main'); p.eq(s._menu.index(),1,'bag command remembered'); await choose(/^Fight/); await inMode('moves'); p.eq(s._menu.index(),3,'bag does not overwrite move memory');
    p.eq(s._session.gw.snapshot(),engine,'cancel paths never submit choice'); p.eq(game(),before,'navigation changes no persistent state'); await abort(); return record({id:'D2-M02',command:1,move:3});
  });
  await scenario('D2-M03 actual three-move grid never focuses the absent fourth slot', async () => {
    const s = await begin(3), before = clone(game()), engine = s._session.gw.snapshot(); await choose(/^Fight/); await inMode('moves'); p.eq(s.inputState().items.length,3,'actual source has three moves');
    for (const [key,index] of [['right',1],['down',1],['left',0],['down',2],['right',2],['up',0]]) { await press(key); p.eq(s._menu.index(),index,'missing cell key '+key); }
    p.eq(s._session.gw.snapshot(),engine,'missing-cell navigation makes no choice'); p.eq(game(),before,'missing cells never install'); await abort(); return record({id:'D2-M03',moves:3});
  });
  await scenario('D2-M04 a real switch resets both cursor memories for the newly shown stable member', async () => {
    const s = await begin(), before = clone(game()), original=s.presentationState().cards.find((x:any)=>x.side==='p1'&&x.active).id;
    await choose(/^Fight/); await inMode('moves'); await press('right'); await press('down'); p.eq(s._menu.index(),3,'old member move memory'); await press('cancel'); await inMode('main'); await choose(/^Pok/); await inMode('party'); await choose(/Blastoise/); await inMode('main');
    const active=s.presentationState().cards.find((x:any)=>x.side==='p1'&&x.active).id; p.assert(active!==original,'actual published switch changed stable member'); p.eq(s._menu.index(),0,'new member command starts at zero'); await choose(/^Fight/); await inMode('moves'); p.eq(s._menu.index(),0,'new member moves start at zero'); p.eq(game(),before,'working switch was not installed'); await abort(); return record({id:'D2-M04',original,active});
  });
}
