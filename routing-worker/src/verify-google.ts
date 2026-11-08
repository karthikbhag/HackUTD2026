import { GoogleTravelProvider } from './travel-provider';
import fixture from '../../data/scenarios/response-routing-demo.json';
const provider=new GoogleTravelProvider(process.env.GOOGLE_MAPS_API_KEY??'',0);
const points=[fixture.staging,fixture.households[3]];
const matrix=await provider.matrix(points,new Date().toISOString());
if(matrix[0][1]===null||matrix[1][0]===null)throw new Error('Fixture endpoint unreachable');
const legs=await provider.directions(points[0],[points[1]],points[0]);
const gaps=legs.map((leg,i)=>{const target=i===0?points[1]:points[0],end=leg.path.at(-1)!;return Math.hypot((target.latitude-end.latitude)*111000,(target.longitude-end.longitude)*94000);});
console.log(JSON.stringify({matrix:'reachable both directions',legs:legs.length,polylineVertices:legs.map(l=>l.path.length),endpointSnapMeters:gaps.map(Math.round)}));
