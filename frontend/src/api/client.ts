import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ---- Types ----

export interface AgentNode {
  id?: string
  type: 'start' | 'llm' | 'http' | 'db' | 'code' | 'end' | 'if_else' | 'loop'
  label: string
  config: Record<string, unknown>
  parent_id?: string | null
  position_x?: number
  position_y?: number
}

export interface AgentEdge {
  id?: string
  source_node_id: string
  target_node_id: string
  source_handle?: string | null
  condition?: string | null
}

export interface Agent {
  id: string
  name: string
  description: string | null
  llm_model?: string | null
  llm_temperature?: string | null
  created_at: string
  updated_at: string
  nodes: AgentNode[]
  edges: AgentEdge[]
}

export interface AgentListResponse {
  items: Agent[]
  total: number
}

export interface RunResponse {
  execution_id: string
  status: string
  output: Record<string, unknown> | null
  error_message: string | null
}

export interface Execution {
  id: string
  agent_id: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  status: string
  error_message: string | null
  started_at: string
  completed_at: string | null
}

// ---- API Functions ----

export async function fetchAgents(search?: string): Promise<AgentListResponse> {
  const params = search ? { search } : {}
  const { data } = await api.get<AgentListResponse>('/agents', { params })
  return data
}

export async function fetchAgent(id: string): Promise<Agent> {
  const { data } = await api.get<Agent>(`/agents/${id}`)
  return data
}

export async function createAgent(payload: {
  name: string
  description?: string | null
  llm_model?: string | null
  llm_temperature?: string | null
  nodes: Array<{
    id?: string
    type: AgentNode['type']
    label: string
    config: Record<string, unknown>
    parent_id?: string | number | null
    position_x?: number
    position_y?: number
  }>
  edges: Array<{
    source_node_id: string | number
    target_node_id: string | number
    source_handle?: string | null
    condition?: string | null
  }>
}): Promise<Agent> {
  const { data } = await api.post<Agent>('/agents', payload)
  return data
}

export async function updateAgent(
  id: string,
  payload: {
    name?: string
    description?: string | null
    llm_model?: string | null
    llm_temperature?: string | null
    nodes?: Array<{
      id?: string
      type: AgentNode['type']
      label: string
      config: Record<string, unknown>
      parent_id?: string | number | null
      position_x?: number
      position_y?: number
    }>
    edges?: Array<{
      source_node_id: string | number
      target_node_id: string | number
      source_handle?: string | null
      condition?: string | null
    }>
  }
): Promise<Agent> {
  const { data } = await api.put<Agent>(`/agents/${id}`, payload)
  return data
}

export async function deleteAgent(id: string): Promise<void> {
  await api.delete(`/agents/${id}`)
}

export async function runAgent(id: string, input: Record<string, unknown>, mode: 'sync' | 'async' = 'sync'): Promise<RunResponse> {
  const params = mode === 'async' ? { mode: 'async' } : {}
  const { data } = await api.post<RunResponse>(`/agents/${id}/run`, { input }, { params })
  return data
}

export async function fetchExecution(id: string): Promise<Execution> {
  const { data } = await api.get<Execution>(`/agents/executions/${id}`)
  return data
}

export async function fetchExecutions(agentId: string): Promise<Execution[]> {
  const { data } = await api.get<Execution[]>(`/agents/${agentId}/executions`)
  return data
}

// ---- Settings ----

export interface AppSettings {
  model: string
  api_key: string
  base_url: string
  temperature: string
  theme: string
}

export async function fetchSettings(): Promise<AppSettings> {
  const { data } = await api.get<AppSettings>('/settings')
  return data
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const { data } = await api.put<AppSettings>('/settings', settings)
  return data
}

// ---- Import/Export ----

export async function exportAgent(id: string): Promise<Record<string, unknown>> {
  const { data } = await api.get(`/agents/${id}/export`)
  return data
}

export async function importAgent(payload: Record<string, unknown>): Promise<Agent> {
  const { data } = await api.post<Agent>('/agents/import', payload)
  return data
}
