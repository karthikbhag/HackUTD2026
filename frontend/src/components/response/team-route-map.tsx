"use client";
import { useEffect, useRef, useState } from "react";
interface Point { latitude:number;longitude:number }
interface MapsApi {
  Map:new(el:HTMLElement,options:object)=>{fitBounds(bounds:unknown):void};
  Marker:new(options:object)=>{setMap(map:unknown):void};
  Polyline:new(options:object)=>{setMap(map:unknown):void};
  LatLngBounds:new()=>{extend(point:object):void};
}
let sdk:Promise<MapsApi>|undefined;
function load(key:string){
  if(!sdk)sdk=new Promise<MapsApi>((resolve,reject)=>{
    const script=document.createElement('script');script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__riskreachMapsReady`;
    (window as unknown as {__riskreachMapsReady:()=>void}).__riskreachMapsReady=()=>{const maps=(window as unknown as {google?:{maps:MapsApi}}).google?.maps;if(maps)resolve(maps);else reject(new Error('Google Maps SDK unavailable'));};
    script.onerror=()=>{sdk=undefined;reject(new Error('Google Maps failed to load; check key restrictions and API enablement'));};document.head.appendChild(script);
  });return sdk;
}
export function TeamRouteMap({browserKey,workerUrl,runId,teamId,version,epoch,team,stops}:{browserKey:string;workerUrl:string;runId:string;teamId:string;version:string;epoch:string;team?:Point;stops:Point[]}){
  const host=useRef<HTMLDivElement>(null),mapRef=useRef<InstanceType<MapsApi['Map']>|null>(null),lastView=useRef(''),[error,setError]=useState('');
  useEffect(()=>{
    if(!browserKey||!host.current)return;
    let disposed=false;const overlays:{setMap(map:unknown):void}[]=[],controller=new AbortController();
    void load(browserKey).then(async maps=>{
      if(disposed||!host.current)return;
      const center=team??stops[0]??{latitude:32.8325,longitude:-96.7695};
      const map=mapRef.current??new maps.Map(host.current,{center:{lat:center.latitude,lng:center.longitude},zoom:15,mapTypeControl:false});mapRef.current=map;
      const bounds=new maps.LatLngBounds();
      for(const [i,p]of [...(team?[team]:[]),...stops].entries()){const position={lat:p.latitude,lng:p.longitude};bounds.extend(position);overlays.push(new maps.Marker({map,position,label:team&&i===0?'T':String(i+(team?0:1))}));}
      const view=`${runId}:${teamId}:${version}`;if(stops.length&&lastView.current!==view){map.fitBounds(bounds);lastView.current=view;}
      try{
        const res=await fetch(`${workerUrl}/route?run=${encodeURIComponent(runId)}&team=${encodeURIComponent(teamId)}`,{cache:'no-store',signal:controller.signal});
        if(!res.ok)throw new Error('Road route unavailable, expired or being replanned. Stop list remains available.');
        const data=await res.json() as {version:string;paths:Point[][]};
        if(data.version!==version)throw new Error('Route update pending');
        if(disposed)return;
        for(const path of data.paths)overlays.push(new maps.Polyline({map,path:path.map(p=>({lat:p.latitude,lng:p.longitude})),strokeColor:'#d62311',strokeWeight:5}));
        setError('');
      }catch(e){if(!disposed)setError(e instanceof Error?e.message:'Route unavailable');}
    }).catch(e=>{if(!disposed)setError(e.message);});
    return()=>{disposed=true;controller.abort();for(const overlay of overlays)overlay.setMap(null);};
  },[browserKey,workerUrl,runId,teamId,version,epoch,team,stops]);
  if(!browserKey)return <p role="status">Google Maps browser key missing. Stops and safety notices remain available.</p>;
  return <section><div ref={host} className="response-map" aria-label="Google map of simulated team route"/>{error&&<p role="status">{error}</p>}</section>;
}
