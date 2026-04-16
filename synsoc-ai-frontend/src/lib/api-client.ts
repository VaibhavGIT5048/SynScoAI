const LOCAL_BACKEND_FALLBACK = 'http://127.0.0.1:8000';
const DEV_PROXY_FALLBACK = '/api';
const PROD_PROXY_FALLBACK = '/backend';

function isLocalBrowserHost(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolveApiBase(): string {
  const explicitRaw = import.meta.env.VITE_API_BASE_URL?.trim() || import.meta.env.VITE_API_URL?.trim();
  if (explicitRaw) {
    const explicitBase = explicitRaw.replace(/\/+$/, '');
    const allowAbsoluteInProd = import.meta.env.VITE_ALLOW_ABSOLUTE_API_BASE === 'true';

    if (import.meta.env.PROD && isAbsoluteHttpUrl(explicitBase) && !allowAbsoluteInProd) {
      console.warn(
        `Ignoring absolute VITE_API_BASE_URL in production (${explicitBase}). Falling back to ${PROD_PROXY_FALLBACK}.`
      );
      return PROD_PROXY_FALLBACK;
    }

    return explicitBase;
  }

  if (import.meta.env.DEV && isLocalBrowserHost()) {
    console.warn(
      `VITE_API_BASE_URL is not set. Falling back to local backend at ${LOCAL_BACKEND_FALLBACK}.`
    );
    return LOCAL_BACKEND_FALLBACK;
  }

  if (import.meta.env.DEV) {
    console.warn(
      `VITE_API_BASE_URL is not set. Falling back to ${DEV_PROXY_FALLBACK} and expecting Vite dev proxy to forward to backend.`
    );
    return DEV_PROXY_FALLBACK;
  }

  console.warn(`VITE_API_BASE_URL is not set. Falling back to ${PROD_PROXY_FALLBACK}.`);
  return PROD_PROXY_FALLBACK;
}

const API_BASE = resolveApiBase();
const VISITOR_ID_STORAGE_KEY = 'synsoc_visitor_id';

async function performRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    if (API_BASE.startsWith('http')) {
      throw new Error(
        `Unable to reach backend at ${API_BASE}. Ensure FastAPI is running and VITE_API_BASE_URL is correct.`
      );
    }

    throw new Error(
      'Unable to reach backend API. Ensure the backend is running and VITE_API_BASE_URL is configured.'
    );
  }
}

async function extractErrorDetail(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: unknown }
      | null;

    if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  }

  if (response.status === 404 && (API_BASE === DEV_PROXY_FALLBACK || API_BASE === PROD_PROXY_FALLBACK)) {
    return `Backend API is not reachable through ${API_BASE}. Check proxy redirects and backend health.`;
  }

  return `HTTP ${response.status}`;
}

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
  return {
    'Content-Type': 'application/json',
    'X-Visitor-Id': getVisitorId(),
  };
}

async function visitorHeaders(): Promise<HeadersInit> {
  return {
    'X-Visitor-Id': getVisitorId(),
  };
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
  const response = await performRequest(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await extractErrorDetail(response));
  }

  return response.json();
}

export function streamPipeline(
  request: PipelineRequest,
  onEvent: (event: string, data: any) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    let sawTerminalEvent = false;

    const emitParsedEvent = (parsed: any) => {
      const eventName = typeof parsed?.event === 'string' ? parsed.event : '';
      if (!eventName) {
        return;
      }

      if (eventName === 'report' || eventName === 'complete' || eventName === 'error') {
        sawTerminalEvent = true;
      }

      onEvent(eventName, parsed);
    };

    const processRawSseBlock = (rawBlock: string) => {
      const lines = rawBlock.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        try {
          const parsed = JSON.parse(line.slice(6));
          emitParsedEvent(parsed);
        } catch {
          // Ignore malformed stream chunks.
        }
      }
    };

    try {
      const headers = await jsonHeaders();
      const response = await performRequest(`${API_BASE}/pipeline/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        onEvent('error', { message: await extractErrorDetail(response) });
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
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          processRawSseBlock(block);
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        processRawSseBlock(trailing);
      }

      if (!sawTerminalEvent) {
        onEvent('stream_closed', { message: 'Stream closed before terminal event.' });
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
  const response = await performRequest(`${API_BASE}/health`, { headers: await visitorHeaders() });
  if (!response.ok) throw new Error('Health check failed');
  return response.json();
}

export async function fetchRun(runId: string): Promise<RunPayload> {
  const response = await performRequest(`${API_BASE}/runs/${encodeURIComponent(runId)}`, {
    headers: await visitorHeaders(),
  });

  if (!response.ok) {
    throw new Error(await extractErrorDetail(response));
  }

  return response.json();
}

export async function downloadRunExport(runId: string, format: 'pdf' | 'docx'): Promise<Blob> {
  const response = await performRequest(`${API_BASE}/runs/${encodeURIComponent(runId)}/export/${format}`, {
    headers: await visitorHeaders(),
  });

  if (!response.ok) {
    throw new Error(await extractErrorDetail(response));
  }

  return response.blob();
}