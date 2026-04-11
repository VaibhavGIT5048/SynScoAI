import { getSupabaseAccessToken } from './supabase-auth';

const rawApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
if (!rawApiBase) {
  throw new Error('Missing required environment variable: VITE_API_BASE_URL');
}

const API_BASE = rawApiBase.replace(/\/+$/, '');
const VISITOR_ID_STORAGE_KEY = 'synsoc_visitor_id';

function getVisitorId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, generated);
  return generated;
}

async function jsonHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Visitor-Id': getVisitorId(),
  };

  const accessToken = await getSupabaseAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function visitorHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'X-Visitor-Id': getVisitorId(),
  };

  const accessToken = await getSupabaseAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  description: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  represents: string;
  personality: string;
  goal: string;
  stance: string;
  memory: string[];
  relationships: string[];
}

export interface SimulationTurn {
  round: number;
  agent_id: string;
  agent_name: string;
  represents: string;
  stance: string;
  message: string;
  emotion: string;
  action: string;
}

export interface StakeholderInsight {
  represents: string;
  summary: string;
  final_stance: string;
  influence_score: number;
}

export interface PipelineRequest {
  topic: string;
  context?: string;
  rounds: number;
  agents_per_round: number;
  agents_per_node?: number;
  random_seed?: number;
}

export interface PipelineResponse {
  topic: string;
  graph: {
    topic: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    summary: string;
  };
  agents: {
    topic: string;
    total_agents: number;
    agents: Agent[];
  };
  simulation: {
    topic: string;
    total_rounds: number;
    total_turns: number;
    turns: SimulationTurn[];
    key_tensions: string[];
    dominant_stances: Record<string, number>;
  };
  report: {
    topic: string;
    executive_summary: string;
    key_findings: string[];
    stakeholder_insights: StakeholderInsight[];
    predicted_outcome: string;
    policy_recommendations: string[];
    conflict_score: number;
    consensus_areas: string[];
    total_turns_analyzed: number;
  };
}

export interface RunPayload {
  run_id: string;
  owner_id?: string | null;
  created_at: number;
  result: PipelineResponse;
}

export async function runPipeline(request: PipelineRequest): Promise<PipelineResponse> {
  const response = await fetch(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export function streamPipeline(
  request: PipelineRequest,
  onEvent: (event: string, data: any) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const headers = await jsonHeaders();
      const response = await fetch(`${API_BASE}/pipeline/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        onEvent('error', { message: error.detail || `HTTP ${response.status}` });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onEvent('error', { message: 'Streaming failed: response body is empty.' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              onEvent(parsed.event, parsed);
            } catch {
              // Ignore malformed stream chunks.
            }
          }
        }
      }
    } catch (err) {
      // Ignore expected abort errors from caller cleanup.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Network error while streaming pipeline.';
      onEvent('error', { message });
    }
  })();

  return () => controller.abort();
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`, { headers: await visitorHeaders() });
  if (!response.ok) throw new Error('Health check failed');
  return response.json();
}

export async function fetchRun(runId: string): Promise<RunPayload> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`, {
    headers: await visitorHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function downloadRunExport(runId: string, format: 'pdf' | 'docx'): Promise<Blob> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/export/${format}`, {
    headers: await visitorHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.blob();
}