"use client";

import { useState } from 'react';
import type { DbConnection } from '@/module_bindings';
import type { MapZone, Selection } from '@/lib/map/types';
import type { HazardFeedState } from '@/module_bindings/types';

export function DummyWeatherControls({connection,zones,selection,feed,runId}:{connection:DbConnection|null;zones:MapZone[];selection:Selection;feed?:HazardFeedState;runId?:bigint}) {
  const [chosen,setChosen]=useState(''),[interval,setInterval]=useState(30),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected = selection?.kind === 'zone' ? selection.id : undefined;
  const areaId = chosen || selected || (feed ? String(feed.areaId) : '') || zones.find(z=>z.simulated)?.id || '';
  const zone = zones.find(z=>z.id===areaId);
  async function act(action:'next'|'play'|'pause') {
    if(!connection?.isActive || runId === undefined || !zone)return;
    setBusy(true);setError('');
    try {
      if(action==='next')await connection.reducers.advanceDummyWeather({areaId:BigInt(areaId),expectedRunId:runId});
      else await connection.reducers.setDummyWeatherFeed({areaId:action==='pause' && feed ? feed.areaId:BigInt(areaId),expectedRunId:runId,enabled:action==='play',intervalSeconds:interval});
    } catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  return <section className="guidance dummy-weather-controls" aria-label="Dummy weather stream">
    <div className="panel-heading"><h3>Dummy weather stream</h3><span className="simulation-badge">Simulation</span></div>
    <p>Shared event updates change severity, location and risk circles. The scenario clock stays separate.</p>
    <label>Weather area <select value={areaId} disabled={busy || !!feed?.enabled} onChange={e=>setChosen(e.target.value)}>{zones.filter(z=>z.simulated).map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
    <label>Update interval <select value={interval} disabled={busy || !!feed?.enabled} onChange={e=>setInterval(Number(e.target.value))}>{[15,30,60].map(value=><option key={value} value={value}>{value} seconds</option>)}</select></label>
    <p className="muted small" role="status">{feed?.enabled ? `Playing · ${zones.find(z=>z.id===String(feed.areaId))?.name ?? 'selected area'} · every ${feed.intervalSeconds}s` : 'Paused'} · {feed?.step ?? 0} updates</p>
    {zone?.eventCenter && <p className="small">{zone.hazard} · {zone.severity} severity · {zone.eventCenter.map(n=>n.toFixed(4)).join(', ')}<br/>High / Medium / Low: {zone.radiiMeters?.map(r=>`${(r/1000).toFixed(1)} km`).join(' / ')}</p>}
    <div className="reply-actions"><button disabled={busy || !zone || runId === undefined} onClick={()=>void act(feed?.enabled?'pause':'play')}>{feed?.enabled?'Pause updates':'Play updates'}</button><button disabled={busy || !!feed?.enabled || !zone || runId === undefined} onClick={()=>void act('next')}>Next weather update</button></div>
    {error && <p role="alert" className="error-banner">{error}</p>}
  </section>;
}
