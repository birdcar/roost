export {
  requireApproval,
  approve,
  getApproval,
  listPendingApprovals,
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
} from './approval.js';
export type {
  ApprovalRequest,
  ApprovalDecision,
  ApprovalStatus,
  ApprovalRoute,
  RequireApprovalOpts,
} from './approval.js';
export { toElicitationEnvelope, routeViaMcp } from './mcp-bridge.js';
export type { McpElicitationEnvelope } from './mcp-bridge.js';
