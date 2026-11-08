import { describe,it,expect } from 'vitest';
import {circlePolygon,eventRadii,riskLevel} from './risk-bands';
import {calculateExposure} from './exposure';
import {encodeRiskMessages,parseRiskMessages} from './risk-messages';
describe('risk bands',()=>{
  it('assigns one highest band, including None outside, independent of household membership',()=>{
    const layers = (['critical','high','moderate'] as const).map((severity,i)=>({id:String(i),disaster_id:'event',hazard_type:'tornado' as const,severity,
      geometry:circlePolygon([-97,33],[1000,2000,3000][i]),component:'risk',data_kind:'simulation' as const,is_simulated:true,source:'fixture',updated_at:'2026-01-01T00:00:00Z',label:severity}));
    const result=calculateExposure([0,0.0135,0.0225,0.04].map((offset,i)=>({id:String(i),longitude:-97,latitude:33+offset})),layers);
    expect(result.households.map(h=>riskLevel(h.highestSeverity))).toEqual(['High','Medium','Low','None']);
  });
  it('includes exact band vertices in the higher band',()=>{
    const geometry=circlePolygon([-97,33],1000), [longitude,latitude]=geometry.coordinates[0][0];
    const result=calculateExposure([{id:'h',longitude,latitude}],[{id:'l',disaster_id:'e',hazard_type:'tornado',severity:'critical',geometry,component:'risk',data_kind:'simulation',is_simulated:true,source:'fixture',updated_at:'2026-01-01T00:00:00Z',label:'high'}]);
    expect(riskLevel(result.households[0].highestSeverity)).toBe('High');
  });
  it('scales hazard-specific modeling profiles and rejects invalid radii',()=>{
    expect(eventRadii('tornado','critical')[2]).toBeGreaterThan(eventRadii('tornado','moderate')[2]);
    expect(eventRadii('hurricane','high')[2]).toBeGreaterThan(eventRadii('tornado','high')[2]);
    expect(()=>circlePolygon([0,0],-1)).toThrow();
  });
  it('roundtrips three reviewed messages and validates empty bands',()=>{
    const messages={High:'Act on authority guidance',Medium:'Prepare',Low:'Monitor'};
    expect(parseRiskMessages(encodeRiskMessages(messages))).toEqual(messages);
    expect(()=>parseRiskMessages(encodeRiskMessages({...messages,Low:''}))).toThrow();
    expect(parseRiskMessages('Legacy reviewed text')).toBeUndefined();
  });
});
