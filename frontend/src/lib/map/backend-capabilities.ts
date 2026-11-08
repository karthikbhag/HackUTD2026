import recipients from '../../module_bindings/dashboard_recipients_table';
import reply from '../../module_bindings/reply_dashboard_notice_reducer';
import response from '../../module_bindings/approve_dashboard_response_reducer';
/** Capabilities follow the generated wire contract, not locally edited server source. */
export const supportsRiskNotices = 'riskLevel' in recipients.row;
export const supportsReplyArea = 'areaId' in reply;
export const supportsResponseArea = 'areaId' in response;

/** Optional wire contract while older deployments lack the weather feed. */
export interface DummyWeatherFeed {
  areaId: bigint;
  enabled: boolean;
  intervalSeconds: number;
  step: number;
}

interface DummyWeatherReducers {
  advanceDummyWeather(args: { areaId: bigint; expectedRunId: bigint }): Promise<void>;
  setDummyWeatherFeed(args: { areaId: bigint; expectedRunId: bigint; enabled: boolean; intervalSeconds: number }): Promise<void>;
}

export function supportsDummyWeather(reducers: object): reducers is DummyWeatherReducers {
  return 'advanceDummyWeather' in reducers && typeof reducers.advanceDummyWeather === 'function'
    && 'setDummyWeatherFeed' in reducers && typeof reducers.setDummyWeatherFeed === 'function';
}
