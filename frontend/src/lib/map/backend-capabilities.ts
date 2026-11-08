import recipients from '../../module_bindings/dashboard_recipients_table';
import reply from '../../module_bindings/reply_dashboard_notice_reducer';
import response from '../../module_bindings/approve_dashboard_response_reducer';
/** Capabilities follow the generated wire contract, not locally edited server source. */
export const supportsRiskNotices = 'riskLevel' in recipients.row;
export const supportsReplyArea = 'areaId' in reply;
export const supportsResponseArea = 'areaId' in response;
