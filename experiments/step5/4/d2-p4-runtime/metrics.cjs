'use strict';
function frameSummary(samples) {
  const result = { kind:'RAW_CLOCK_ANALYSIS_NOT_P4', clocks:{} };
  for (const sample of samples) if (!['updateMain','rAF'].includes(sample.kind) ||
    !Number.isFinite(sample.dt) || sample.dt <= 0 || !Number.isFinite(sample.t)) throw Error('invalid raw frame');
  for (const kind of ['updateMain','rAF']) {
    const raw = samples.filter(s => s.kind === kind), sorted = raw.map(s => s.dt).sort((a,b)=>a-b);
    for (let i=1;i<raw.length;i++) if (raw[i].t < raw[i-1].t) throw Error('clock samples reordered');
    const q = fraction => sorted.length ? sorted[Math.floor((sorted.length-1)*fraction)] : null;
    const runs = []; let current = null;
    for (const row of raw) {
      if (row.dt > 33) { if (!current) runs.push(current=[]); current.push({...row}); }
      else current = null;
    }
    const over33 = raw.filter(s => s.dt > 33).length;
    result.clocks[kind] = { count:raw.length, p50:q(.5), p95:q(.95), p99:q(.99),
      max:sorted.at(-1) ?? null, over33, over33Ratio:raw.length ? over33/raw.length : null,
      unfocused:raw.filter(s=>s.focus !== true || s.visibility !== 'visible').length,
      longRuns:runs, raw:raw.map(s=>({...s})) };
  }
  return result;
}
function waitUnion(intervals) {
  const ordered = intervals.map(({start,end})=>{
    if (!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<start) throw Error('invalid wait interval');
    return {start,end};
  }).sort((a,b)=>a.start-b.start);
  const union=[];
  for(const row of ordered) { const last=union.at(-1); if(last && row.start<=last.end)last.end=Math.max(last.end,row.end);else union.push({...row}); }
  return { intervals:union, milliseconds:union.reduce((n,x)=>n+x.end-x.start,0) };
}
function naturalMedian(rows) {
  const names=['natural1','natural2','natural3'];
  if(rows.length!==3 || new Set(rows.map(x=>x.mode)).size!==3 ||
    rows.some(x=>!names.includes(x.mode)||!Number.isFinite(x.value))) throw Error('exact three natural process summaries required');
  return rows.map(x=>x.value).sort((a,b)=>a-b)[1];
}
function warnComparison(control,candidate,{comparable,unit}) {
  if(comparable!==true)return {status:'NOT_COMPARABLE',control,candidate,unit};
  if(!Number.isFinite(control)||!Number.isFinite(candidate))throw Error('finite measurements required');
  return { status:control>0 ? candidate>control*1.2 ? 'WARN' : 'REPORTED' : 'RATIO_NOT_APPLICABLE',
    control,candidate,unit,difference:candidate-control,ratio:control>0?candidate/control:null,acceptance:'NOT_GRANTED' };
}
module.exports={frameSummary,waitUnion,naturalMedian,warnComparison};
