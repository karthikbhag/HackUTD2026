"use client";
import { useEffect, useState } from "react";
import { DbConnection, tables } from "@/module_bindings";
import type { ResponseRun, WelfareVisit, TeamRoute, ResponseTeamState, Household, ResponseTeam } from "@/module_bindings/types";
import { toMapData } from "@/lib/map/backend-data";
import type { DataStatus, MapData } from "@/lib/map/types";
interface Snapshot { data: MapData; status: DataStatus; errorMessage?: string; identity?: string; runs: ResponseRun[]; visits: WelfareVisit[]; routes: TeamRoute[]; teamStates: ResponseTeamState[]; households: Household[]; teams: ResponseTeam[] }
const empty: Snapshot = { data:{zones:[],households:[],teams:[]},status:"loading",runs:[],visits:[],routes:[],teamStates:[],households:[],teams:[] };
/** One connection per mounted page shell; endpoint-scoped token matches the dispatcher. */
export function useOperationalConnection(uri: string, database: string) {
  const [conn,setConn]=useState<DbConnection|null>(null),[snapshot,setSnapshot]=useState<Snapshot>(empty);
  useEffect(()=>{
    let disposed=false,ready=false,queued=false,identity:string|undefined;
    const tokenKey=`riskreach:${uri}/${database}:token`;
    const fail=(error:unknown)=>{ready=false;if(!disposed)setSnapshot({...empty,status:"error",identity,errorMessage:error instanceof Error?error.message:String(error)});};
    const connection=DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(localStorage.getItem(tokenKey)??undefined).withAutomaticReconnect()
      .onConnect((c,who,token)=>{if(disposed)return;identity=who.toHexString();localStorage.setItem(tokenKey,token);setConn(c);setSnapshot({...empty,identity});})
      .onConnectError((_ctx,e)=>fail(e)).onDisconnect((_ctx,e)=>fail(e??new Error("Operational connection closed"))).build();
    const refresh=()=>{if(disposed||!ready)return;try{
      const visits=[...connection.db.welfareVisits.iter()],teamStates=[...connection.db.responseTeamStates.iter()];
      const data=toMapData({disasters:[...connection.db.disasters.iter()],zones:[...connection.db.zones.iter()],households:[...connection.db.households.iter()],requests:[...connection.db.requests.iter()],teams:[...connection.db.teams.iter()],tasks:[...connection.db.tasks.iter()],assignments:[...connection.db.assignments.iter()],impactLayers:[...connection.db.impactLayers.iter()],welfareVisits:visits,responseTeamStates:teamStates});
      setSnapshot({data,status:"connected",identity,runs:[...connection.db.responseRuns.iter()],visits,routes:[...connection.db.teamRoutes.iter()],teamStates,households:[...connection.db.routingHouseholds.iter()],teams:[...connection.db.routingTeams.iter()]});
    }catch(e){if(!disposed)setSnapshot({...empty,status:"error",identity,errorMessage:e instanceof Error?e.message:String(e)});}};
    const changed=()=>{if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});};
    const handles=[connection.db.disasters,connection.db.zones,connection.db.households,connection.db.requests,connection.db.teams,connection.db.tasks,connection.db.assignments,connection.db.impactLayers,connection.db.responseRuns,connection.db.welfareVisits,connection.db.teamRoutes,connection.db.responseTeamStates,connection.db.routingHouseholds,connection.db.routingTeams];
    for(const table of handles){table.onInsert(changed);table.onDelete(changed);table.onUpdate(changed);}
    const sub=connection.subscriptionBuilder().onApplied(()=>{ready=true;refresh();}).onError(ctx=>fail(ctx.event)).subscribe([tables.disasters,tables.zones,tables.households,tables.requests,tables.teams,tables.tasks,tables.assignments,tables.impactLayers,tables.responseRuns,tables.welfareVisits,tables.teamRoutes,tables.responseTeamStates,tables.routingHouseholds,tables.routingTeams]);
    return()=>{disposed=true;for(const table of handles){table.removeOnInsert(changed);table.removeOnDelete(changed);table.removeOnUpdate(changed);}sub.unsubscribe();connection.disconnect();};
  },[uri,database]);
  return {conn,snapshot};
}
