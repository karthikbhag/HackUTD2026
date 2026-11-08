import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import type db from './schema';
import { ringCenter, eventRadii } from './risk-bands';
import { ingestHazard } from './hazard-ingestion';
type Ctx = ReducerCtx<InferSchema<typeof db>>;
function validate(ctx:Ctx,areaId:bigint,expectedRunId:bigint) {
  if ((ctx.db.scenarioState.id.find(1)?.runId ?? 0n) !== expectedRunId) throw new SenderError('Scenario changed; reload weather controls');
  const area = ctx.db.zone.id.find(areaId), disaster = area && ctx.db.disaster.id.find(area.disasterId);
  if (!area || area.level !== 'neighborhood' || !disaster?.isSimulated) throw new SenderError('Select a synthetic weather area');
  return {area,disaster};
}
export function configureDummyFeed(ctx:Ctx,args:{areaId:bigint;expectedRunId:bigint;enabled:boolean;intervalSeconds:number}) {
  validate(ctx,args.areaId,args.expectedRunId);
  if (![15,30,60].includes(args.intervalSeconds)) throw new SenderError('Weather interval must be 15, 30 or 60 seconds');
  const previous = ctx.db.hazardFeedState.id.find(1);
  const row = {id:1,areaId:args.areaId,enabled:args.enabled,intervalSeconds:args.intervalSeconds,step:previous?.areaId === args.areaId ? previous.step : 0,updatedAt:ctx.timestamp};
  if (previous) ctx.db.hazardFeedState.id.update(row); else ctx.db.hazardFeedState.insert(row);
  for (const timer of [...ctx.db.hazardFeedTick.iter()]) ctx.db.hazardFeedTick.scheduledId.delete(timer.scheduledId);
  if (args.enabled) ctx.db.hazardFeedTick.insert({scheduledId:0n,scheduledAt:ScheduleAt.interval(BigInt(args.intervalSeconds)*1000000n)});
}
export function advanceDummyFeed(ctx:Ctx,args:{areaId:bigint;expectedRunId:bigint}) {
  const {area,disaster} = validate(ctx,args.areaId,args.expectedRunId);
  const previous = ctx.db.hazardFeedState.id.find(1);
  const step = previous?.areaId === area.id ? previous.step+1 : 1;
  const center = ringCenter(JSON.parse(area.boundary).coordinates[0]);
  const sequence = ['moderate','high','critical','high'] as const;
  const severity = sequence[(step-1)%sequence.length];
  const offset = Math.min(eventRadii(disaster.type,'high')[0]/4,500);
  const latitude = center[1]+Math.sin(step*Math.PI/2)*offset/111195;
  const longitude = center[0]+Math.cos(step*Math.PI/2)*offset/(111195*Math.cos(center[1]*Math.PI/180));
  const prefix=`event:${disaster.id}:v`;
  const currentVersion=Math.max(0,...[...ctx.db.impactLayer.disasterId.filter(disaster.id)].filter(l=>l.id.startsWith(prefix)).map(l=>Number(l.id.slice(prefix.length).split(':')[0])));
  ingestHazard(ctx,{areaId:String(area.id),version:currentVersion+1,hazard:disaster.type,severity,longitude,latitude,
    observedAt:ctx.timestamp.toDate().toISOString(),expiresAt:new Date(Number(ctx.timestamp.microsSinceUnixEpoch/1000n)+86400000).toISOString(),
    source:'StateWatch deterministic dummy weather stream',dataKind:'simulation',status:'active'});
  const row={id:1,areaId:area.id,enabled:previous?.enabled ?? false,intervalSeconds:previous?.intervalSeconds ?? 30,step,updatedAt:ctx.timestamp};
  if(previous)ctx.db.hazardFeedState.id.update(row);else ctx.db.hazardFeedState.insert(row);
}
export function stopDummyFeed(ctx:Ctx) {
  for(const timer of [...ctx.db.hazardFeedTick.iter()])ctx.db.hazardFeedTick.scheduledId.delete(timer.scheduledId);
  const row=ctx.db.hazardFeedState.id.find(1);
  if(row)ctx.db.hazardFeedState.id.update({...row,enabled:false,updatedAt:ctx.timestamp});
}
