/** Poll a normalized hazard feed or replay a local JSON batch. No provider keys in browser. */
import { readFile } from 'node:fs/promises';
import { DbConnection } from '../../frontend/src/module_bindings';
import type { HazardUpdate } from '../src/hazard-ingestion';
const uri = process.env.SPACETIMEDB_URI;
const database = process.env.SPACETIMEDB_DATABASE;
const token = process.env.HAZARD_WORKER_TOKEN;
const feed = process.env.HAZARD_FEED_URL;
const replay = process.argv[2];
if (!uri || !database || !token || (!feed && !replay)) throw new Error('Set SPACETIMEDB_URI, SPACETIMEDB_DATABASE, HAZARD_WORKER_TOKEN and HAZARD_FEED_URL (or pass a replay JSON path)');
const connection = await new Promise<DbConnection>((resolve,reject) => {
  DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token).onConnect(resolve).onConnectError((_ctx,error) => reject(error)).build();
});
let stopped = false;
process.on('SIGINT',()=>{stopped=true;connection.disconnect();});
process.on('SIGTERM',()=>{stopped=true;connection.disconnect();});
const interval = Number(process.env.HAZARD_POLL_MS ?? 30000);
if (!Number.isFinite(interval) || interval < 1000) throw new Error('HAZARD_POLL_MS must be at least 1000');
try {
  do {
    try {
      let batch: HazardUpdate[];
      if (replay) batch = JSON.parse(await readFile(replay,'utf8'));
      else {
        const response = await fetch(feed!,{signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
        batch = await response.json() as HazardUpdate[];
      }
      if (!Array.isArray(batch) || batch.length > 1000) throw new Error('Feed must be an array of at most 1000 event updates');
      for (const update of batch) await connection.reducers.ingestHazardEvent({update: {...update, radiiMeters:update.radiiMeters}});
      console.log(`Processed ${batch.length} hazard updates`);
    } catch (error) {
      console.error('Hazard ingestion failed:',error instanceof Error ? error.message : 'Unknown error');
      if (replay) throw error;
    }
    if (!replay && !stopped) await new Promise(resolve => setTimeout(resolve,interval));
  } while (!replay && !stopped);
} finally { connection.disconnect(); }
