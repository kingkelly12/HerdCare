import { apiRequest, type ApiResult } from './client';

export interface AgentSummary {
  agent: { code: string; name: string };
  farms: number;
  currency: string;
  owed: number;
  settled: number;
}

export interface AgentFarm {
  phone: string;
  name: string;
  plan: string;
  expiresAt: string;
  agent: string | null;
  daysLeft: number;
  state: 'active' | 'grace' | 'expired';
}

export interface AgentEarning {
  paid_at: string;
  plan: string;
  amount: number;
  commission: number;
  bounty: number;
  settled_at: string | null;
  phone: string;
  name: string;
}

export interface AdminAgent {
  code: string;
  name: string;
  phone: string | null;
  commissionRate: number;
  activationBounty: number;
  active: number;
  createdAt: string;
  farms: number;
  owed: number;
  settled: number;
}

export interface CreateAgentResult {
  agent: { code: string; name: string };
  apiKey: string;
  warning: string;
}

export interface SettleResult {
  agent: string;
  settled: number;
  payments: number;
  currency: string;
  settledAt: string;
}

/** Fetches the authenticated agent's summary (owed, settled, farms). Can be called with agentKey OR adminToken (+ optional agentCode). */
export function getAgentMe(token: string, agentCode?: string): Promise<ApiResult<AgentSummary>> {
  const query = agentCode ? `?code=${encodeURIComponent(agentCode)}` : '';
  return apiRequest<AgentSummary>(`/agents/me${query}`, { token });
}

/** Fetches the agent's farmers, sorted soonest to expire first. Can be called with agentKey OR adminToken (+ optional agentCode). */
export function getAgentFarms(token: string, agentCode?: string): Promise<ApiResult<{ farms: AgentFarm[] }>> {
  const query = agentCode ? `?code=${encodeURIComponent(agentCode)}` : '';
  return apiRequest<{ farms: AgentFarm[] }>(`/agents/me/farms${query}`, { token });
}

/** Fetches the agent's payments and earnings history. Can be called with agentKey OR adminToken (+ optional agentCode). */
export function getAgentEarnings(token: string, agentCode?: string): Promise<ApiResult<{ currency: string; earnings: AgentEarning[] }>> {
  const query = agentCode ? `?code=${encodeURIComponent(agentCode)}` : '';
  return apiRequest<{ currency: string; earnings: AgentEarning[] }>(`/agents/me/earnings${query}`, { token });
}

/** Admin: Lists all registered agents and their metrics. */
export function getAdminAgents(adminToken: string): Promise<ApiResult<{ agents: AdminAgent[]; currency: string }>> {
  return apiRequest<{ agents: AdminAgent[]; currency: string }>('/admin/agents', { token: adminToken });
}

/** Admin: Registers a new agent. */
export function createAdminAgent(
  adminToken: string,
  data: { code: string; name: string; phone?: string; commissionRate?: number; activationBounty?: number },
): Promise<ApiResult<CreateAgentResult>> {
  return apiRequest<CreateAgentResult>('/admin/agents', {
    method: 'POST',
    token: adminToken,
    body: data,
  });
}

/** Admin: Marks an agent's outstanding balance as settled/paid. */
export function settleAdminAgent(adminToken: string, code: string): Promise<ApiResult<SettleResult>> {
  return apiRequest<SettleResult>(`/admin/agents/${encodeURIComponent(code)}/settle`, {
    method: 'POST',
    token: adminToken,
  });
}

export interface RegisterAgentResult {
  agent: {
    code: string;
    name: string;
    phone: string;
    commissionRate: number;
    activationBounty: number;
  };
  apiKey: string;
  isExisting: boolean;
}

/** Public / Farmer self-registration to become a community agent. */
export function registerAgent(data: { name: string; phone: string }): Promise<ApiResult<RegisterAgentResult>> {
  return apiRequest<RegisterAgentResult>('/agents/register', {
    method: 'POST',
    body: data,
  });
}

