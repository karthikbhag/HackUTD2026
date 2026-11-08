"use client";
import { useEffect, useState } from "react";
import { DbConnection, tables } from "@/module_bindings";
import type { ResponseRun, WelfareVisit, TeamRoute, ResponseTeamState, Household, ResponseTeam, Zone } from "@/module_bindings/types";
import { toMapData } from "@/lib/map/backend-data";
import type { DataStatus, MapData } from "@/lib/map/types";
interface Snapshot { zones: Zone[]; data: MapData; status: DataStatus; errorMessage?: string; routingError?: string; identity?: string; runs: ResponseRun[]; visits: WelfareVisit[]; routes: TeamRoute[]; teamStates: ResponseTeamState[]; households: Household[]; teams: ResponseTeam[] }
const empty: Snapshot = { zones:[], data:{zones:[],households:[],teams:[]},status:"loading",runs:[],visits:[],routes:[],teamStates:[],households:[],teams:[] };
/** One connection per mounted page shell; endpoint-scoped token matches the dispatcher. */
export function useOperationalConnection(uri: string, database: string, includeMap = true) {
  const [conn,setConn]=useState<DbConnection|null>(null),[snapshot,setSnapshot]=useState<Snapshot>(empty);
  useEffect(()=>{
    let disposed=false,ready=false,routingReady=false,queued=false,identity:string|undefined,routingError:string|undefined;
    const message=(error:unknown)=>error instanceof Error?error.message:String(error);
    const tokenKey=`riskreach:${uri}/${database}:token`;
    const fail=(error:unknown)=>{ready=false;if(!disposed)setSnapshot({...empty,status:"error",identity,errorMessage:error instanceof Error?error.message:String(error)});};
    const connection=DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(localStorage.getItem(tokenKey)??undefined).withAutomaticReconnect()
      .onConnect((c,who,token)=>{if(disposed)return;identity=who.toHexString();localStorage.setItem(tokenKey,token);setConn(c);setSnapshot({...empty,identity});})
      .onConnectError((_ctx,e)=>fail(e)).onDisconnect((_ctx,e)=>fail(e??new Error("Operational connection closed"))).build();
    const refresh=()=>{if(disposed||!ready)return;try{
      const visits=routingReady?[...connection.db.welfareVisits.iter()]:[],teamStates=routingReady?[...connection.db.responseTeamStates.iter()]:[];
      const data=includeMap ? toMapData({disasters:[...connection.db.disasters.iter()],zones:[...connection.db.zones.iter()],households:[...connection.db.households.iter()],requests:[...connection.db.requests.iter()],teams:[...connection.db.teams.iter()],tasks:[...connection.db.tasks.iter()],assignments:[...connection.db.assignments.iter()],impactLayers:[...connection.db.impactLayers.iter()],welfareVisits:visits,responseTeamStates:teamStates}) : empty.data;
      setSnapshot({zones:[...connection.db.zones.iter()],data,status:"connected",identity,routingError,runs:routingReady?[...connection.db.responseRuns.iter()]:[],visits,routes:routingReady?[...connection.db.teamRoutes.iter()]:[],teamStates,households:routingReady?[...connection.db.routingHouseholds.iter()]:[],teams:routingReady?[...connection.db.routingTeams.iter()]:[]});
    }catch(e){if(!disposed)setSnapshot({...empty,status:"error",identity,errorMessage:e instanceof Error?e.message:String(e)});}};
    const changed=()=>{if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});};
    const handles=[connection.db.zones,...(includeMap ? [connection.db.disasters,connection.db.households,connection.db.requests,connection.db.teams,connection.db.tasks,connection.db.assignments,connection.db.impactLayers] : []),connection.db.responseRuns,connection.db.welfareVisits,connection.db.teamRoutes,connection.db.responseTeamStates,connection.db.routingHouseholds,connection.db.routingTeams];
    for(const table of handles){table.onInsert(changed);table.onDelete(changed);table.onUpdate(changed);}
    // A routing deployment mismatch must not discard the shared disaster dataset.
    const core=connection.subscriptionBuilder().onApplied(()=>{ready=true;refresh();})
      .onError(ctx=>fail(new Error(`Shared database subscription failed: ${message(ctx.event)}. Check the deployed core views and browser authorization.`)))
      .subscribe([tables.zones,...(includeMap ? [tables.disasters,tables.households,tables.requests,tables.teams,tables.tasks,tables.assignments,tables.impactLayers] : [])]);
    const routing=connection.subscriptionBuilder().onApplied(()=>{routingReady=true;routingError=undefined;refresh();})
      .onError(ctx=>{routingReady=false;routingError=`Response routing unavailable: ${message(ctx.event)}. Publish the matching backend module, then reload. Shared map data remains available.`;refresh();})
      .subscribe([tables.responseRuns,tables.welfareVisits,tables.teamRoutes,tables.responseTeamStates,tables.routingHouseholds,tables.routingTeams]);
    return()=>{disposed=true;for(const table of handles){table.removeOnInsert(changed);table.removeOnDelete(changed);table.removeOnUpdate(changed);}core.unsubscribe();routing.unsubscribe();connection.disconnect();};
  },[uri,database,includeMap]);
  return {conn,snapshot};
}
