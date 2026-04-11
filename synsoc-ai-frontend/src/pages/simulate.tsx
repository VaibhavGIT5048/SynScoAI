import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Info } from 'lucide-react';
import * as d3 from 'd3';
import { streamPipeline } from '../lib/api-client';
import type { GraphNode, GraphEdge, Agent, SimulationTurn } from '../lib/api-client';

const STANCE_COLORS: Record<string, string> = {
  strongly_for: '#00ff88',
  for: '#00cc66',
  neutral: '#888888',
  against: '#ff6644',
  strongly_against: '#ff2222',
};

const EMOTION_COLORS: Record<string, string> = {
  calm: '#00cc66',
  hopeful: '#00aaff',
  firm: '#ffaa00',
  frustrated: '#ff6644',
  angry: '#ff2222',
  concerned: '#aa88ff',
  passionate: '#ff88aa',
};

const ACTION_COLORS: Record<string, string> = {
  argues: '#ffaa00',
  challenges: '#ff8a00',
  warns: '#ff5a3d',
  proposes: '#00c8ff',
  demands: '#ff3344',
  supports: '#00d48a',
  agrees: '#00ff88',
};

type DebateEvent = {
  id: string;
  round: number;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  action: string;
  emotion: string;
  message: string;
  color: string;
};

const WORKSPACE_STORAGE_KEY = 'synsoc_simulation_workspace';

const formatLabel = (raw?: string) => {
  const text = (raw ?? '').trim();
  if (!text) return '';
  const words = text.split(/\s+/).slice(0, 3).join(' ');
  return words.length > 22 ? `${words.slice(0, 21)}…` : words;
};

const shortMsg = (raw?: string, len = 110) => {
  const msg = (raw ?? '').trim();
  return msg.length > len ? `${msg.slice(0, len - 1)}…` : msg;
};

type Phase = 'config' | 'live' | 'done';

type SimulationWorkspaceSnapshot = {
  phase: Phase;
  form: {
    topic: string;
    context: string;
    rounds: number;
    agents_per_round: number;
    agents_per_node: number;
  };
  statusMsg: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  agents: Agent[];
  turns: SimulationTurn[];
  debateEvents: DebateEvent[];
};

export default function SimulatePage() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<any>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const releaseLayoutTimerRef = useRef<number | null>(null);
  const d3InitRef = useRef(false);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const d3NodesRef = useRef<any[]>([]);
  const d3LinksRef = useRef<any[]>([]);
  const agentsRef = useRef<Agent[]>([]);
  const selectAllActiveRef = useRef(false);
  const selectedNodeIdRef = useRef<string | null>(null);
  const selectedDebateIdRef = useRef<string | null>(null);
  const selectedAgentIdRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>('config');
  const [form, setForm] = useState({ topic: '', context: '', rounds: 2, agents_per_round: 3, agents_per_node: 3 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusMsg, setStatusMsg] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem('synsoc_last_run_id');
  });

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [graphEdgesState, setGraphEdgesState] = useState<GraphEdge[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [turns, setTurns] = useState<SimulationTurn[]>([]);
  const [debateEvents, setDebateEvents] = useState<DebateEvent[]>([]);

  // ── SELECTED STATE — persists until another item is clicked ──────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDebateId, setSelectedDebateId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectAllActive, setSelectAllActive] = useState(false);

  const selectedAgent = selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) ?? null : null;
  const selectedAgentTurns = selectedAgentId
    ? turns.filter((turn) => turn.agent_id === selectedAgentId).slice(-5).reverse()
    : [];
  const latestTurnByAgent = turns.reduce<Record<string, SimulationTurn>>((acc, turn) => {
    acc[turn.agent_id] = turn;
    return acc;
  }, {});

  const [sections, setSections] = useState({ legend: true, roster: true, timeline: true });

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    selectedDebateIdRef.current = selectedDebateId;
    selectedAgentIdRef.current = selectedAgentId;
  }, [selectedNodeId, selectedDebateId, selectedAgentId]);

  useEffect(() => {
    selectAllActiveRef.current = selectAllActive;
  }, [selectAllActive]);

  useEffect(() => () => {
    if (releaseLayoutTimerRef.current) {
      window.clearTimeout(releaseLayoutTimerRef.current);
    }
  }, []);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  const resetNodeStyles = useCallback(() => {
    if (!svgRef.current) return;

    d3.select(svgRef.current).select('#nodes-layer')
      .selectAll<SVGGElement, any>('g')
      .each(function(d) {
        d3.select(this).select('circle').transition().duration(250)
          .attr('r', d.isGraphNode ? 20 : 11)
          .attr('fill-opacity', 0.25)
          .attr('filter', null)
          .attr('stroke-width', d.isGraphNode ? 2.5 : 1.5);
      });
  }, []);

  // ── D3 SETUP ─────────────────────────────────────────────────────────
  const setupD3 = useCallback(() => {
    if (!svgRef.current || d3InitRef.current) return;
    d3InitRef.current = true;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const w = svgRef.current.clientWidth || 900;
    const h = svgRef.current.clientHeight || 520;
    svg.attr('viewBox', `0 0 ${w} ${h}`);

    // Glow filter
    const defs = svg.append('defs');
    const f = defs.append('filter').attr('id', 'glow');
    f.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'coloredBlur');
    const m = f.append('feMerge');
    m.append('feMergeNode').attr('in', 'coloredBlur');
    m.append('feMergeNode').attr('in', 'SourceGraphic');

    // Zoomable viewport
    const vp = svg.append('g').attr('id', 'viewport');
    vp.append('g').attr('id', 'links-layer');
    vp.append('g').attr('id', 'nodes-layer');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', ev => vp.attr('transform', ev.transform));
    zoomRef.current = zoom;
    svg.style('cursor', 'grab').call(zoom);
    svg.on('mousedown.zoom', () => svg.style('cursor', 'grabbing'));
    svg.on('mouseup.zoom', () => svg.style('cursor', 'grab'));
    svg.on('mouseleave.zoom', () => svg.style('cursor', 'grab'));

    // Force sim
    const linkForce = d3.forceLink([])
      .id((d: any) => d.id)
      .distance((d: any) => {
        if (d.hidden) return 170;
        if (d.internal) return 120;
        return 140;
      })
      .strength((d: any) => {
        if (d.hidden) return 0.28;
        if (d.internal) return 0.24;
        return 0.2;
      });

    const sim = d3.forceSimulation([])
      .force('link', linkForce)
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide(36))
      .alphaDecay(0.018);

    simRef.current = sim;

    sim.on('tick', () => {
      svg.select('#links-layer').selectAll<SVGLineElement, any>('line')
        .attr('x1', d => (typeof d.source === 'object' ? d.source.x : 0) ?? 0)
        .attr('y1', d => (typeof d.source === 'object' ? d.source.y : 0) ?? 0)
        .attr('x2', d => (typeof d.target === 'object' ? d.target.x : 0) ?? 0)
        .attr('y2', d => (typeof d.target === 'object' ? d.target.y : 0) ?? 0);
      svg.select('#nodes-layer').selectAll<SVGGElement, any>('g')
        .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }, []);

  // ── ADD NODE ──────────────────────────────────────────────────────────
  const addD3Node = useCallback((nd: any) => {
    if (!svgRef.current || !simRef.current) return;
    const svg = d3.select(svgRef.current);
    const sim = simRef.current;

    d3NodesRef.current = [...d3NodesRef.current, nd];

    const sel = svg.select('#nodes-layer').selectAll<SVGGElement, any>('g')
      .data(d3NodesRef.current, (d: any) => d.id);

    const entering = sel.enter().append('g')
      .style('cursor', 'grab');

    // Circle
    entering.append('circle')
      .attr('r', 0)
      .attr('fill', (d: any) => STANCE_COLORS[d.stance] ?? (d.isGraphNode ? '#0d3d26' : '#111'))
      .attr('fill-opacity', 0.25)
      .attr('stroke', (d: any) => STANCE_COLORS[d.stance] ?? (d.isGraphNode ? '#1a6b4a' : '#333'))
      .attr('stroke-width', (d: any) => d.isGraphNode ? 2.5 : 1.5)
      .transition().duration(600).ease(d3.easeBounceOut)
      .attr('r', (d: any) => d.isGraphNode ? 20 : 11);

    // Label
    entering.append('text')
      .text((d: any) => formatLabel(d.label || d.name))
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => d.isGraphNode ? 38 : 27)
      .attr('font-size', (d: any) => d.isGraphNode ? '13px' : '11px')
      .attr('font-weight', 600)
      .attr('fill', (d: any) => d.isGraphNode ? '#e0e0e0' : '#aaa')
      .attr('font-family', 'var(--font-sans)')
      .attr('opacity', 0)
      .transition().duration(400).delay(250).attr('opacity', 1);

    entering.append('title').text((d: any) => d.label || d.name || '');

    entering.call(
      d3.drag<any, any>()
        .on('start', function(ev, d) {
          if (!ev.active) sim.alphaTarget(0.3).restart();
          if (selectAllActiveRef.current) {
            d3NodesRef.current.forEach((node: any) => {
              node.fx = node.x;
              node.fy = node.y;
            });
          } else {
            d.fx = d.x;
            d.fy = d.y;
          }
          d3.select(this).style('cursor', 'grabbing');
        })
        .on('drag', (ev, d) => {
          if (selectAllActiveRef.current) {
            const dx = typeof ev.dx === 'number' ? ev.dx : ev.x - (d.fx ?? d.x ?? ev.x);
            const dy = typeof ev.dy === 'number' ? ev.dy : ev.y - (d.fy ?? d.y ?? ev.y);
            d3NodesRef.current.forEach((node: any) => {
              const nextX = (node.x ?? 0) + dx;
              const nextY = (node.y ?? 0) + dy;
              node.fx = nextX;
              node.fy = nextY;
              node.x = nextX;
              node.y = nextY;
            });
            return;
          }
          d.fx = ev.x;
          d.fy = ev.y;
        })
        .on('end', function(ev, d) {
          if (!ev.active) sim.alphaTarget(0);
          if (selectAllActiveRef.current) {
            d3NodesRef.current.forEach((node: any) => {
              node.fx = null;
              node.fy = null;
            });
          } else {
            d.fx = null;
            d.fy = null;
          }
          d3.select(this).style('cursor', 'grab');
        })
    );

    entering.on('click', function(event, d) {
      if (event.defaultPrevented) return;
      if (selectAllActiveRef.current) {
        setSelectAllActive(false);
      }

      const graphNode = d3NodesRef.current.find((node: any) => node.isGraphNode && (node.id === d.represents || node.label === d.represents));

      if (d.isGraphNode) {
        const nodeAgents = agentsRef.current.filter((agent) => agent.represents === d.id || agent.represents === d.label);
        const selectedFromNode = nodeAgents.find((agent) => agent.id === selectedAgentIdRef.current) ?? nodeAgents[0] ?? null;
        setSelectedNodeId(d.id);
        setSelectedDebateId(null);
        setSelectedAgentId(selectedFromNode?.id ?? null);
        if (selectedFromNode) {
          highlightAgent([d.id, selectedFromNode.id]);
          focusAgents(d.id, selectedFromNode.id);
        } else {
          highlightAgent([d.id, ...nodeAgents.map((agent) => agent.id)]);
          focusAgents(d.id);
        }
        return;
      }

      setSelectedAgentId(d.id);
      setSelectedNodeId(graphNode?.id ?? null);
      setSelectedDebateId(null);
      highlightAgent([d.id, graphNode?.id].filter(Boolean) as string[]);
      focusAgents(d.id, graphNode?.id);
    });

    sim.nodes(d3NodesRef.current);
    sim.alpha(0.4).restart();
  }, []);

  // ── ADD LINK ──────────────────────────────────────────────────────────
  const addD3Link = useCallback((source: string, target: string, internal = false, hidden = false) => {
    if (!svgRef.current || !simRef.current) return;
    const svg = d3.select(svgRef.current);
    const sim = simRef.current;

    const getEndpointId = (endpoint: any) => (typeof endpoint === 'string' ? endpoint : endpoint?.id);
    const exists = d3LinksRef.current.some((ln: any) => {
      const a = getEndpointId(ln.source);
      const b = getEndpointId(ln.target);
      return (a === source && b === target) || (a === target && b === source);
    });
    if (exists) return;

    d3LinksRef.current = [...d3LinksRef.current, { source, target, internal, hidden }];

    svg.select('#links-layer').selectAll<SVGLineElement, any>('line')
      .data(d3LinksRef.current)
      .join(
        enter => enter.append('line')
          .attr('stroke', d => d.hidden ? 'transparent' : (d.internal ? '#2be7ab' : '#2a4a3a'))
          .attr('stroke-width', d => d.hidden ? 0 : (d.internal ? 2.2 : 1.4))
          .attr('stroke-opacity', d => d.hidden ? 0 : (d.internal ? 0.9 : 0.75))
          .attr('stroke-linecap', 'round')
          .attr('pointer-events', 'none')
          .attr('opacity', d => d.hidden ? 0 : 0)
          .call(el => el.transition().duration(400).attr('opacity', d => d.hidden ? 0 : 1)),
        update => update
          .attr('stroke', d => d.hidden ? 'transparent' : (d.internal ? '#2be7ab' : '#2a4a3a'))
          .attr('stroke-width', d => d.hidden ? 0 : (d.internal ? 2.2 : 1.4))
          .attr('stroke-opacity', d => d.hidden ? 0 : (d.internal ? 0.9 : 0.75))
          .attr('stroke-linecap', 'round')
          .attr('pointer-events', 'none')
          .attr('opacity', d => d.hidden ? 0 : 1),
        exit => exit.remove()
      );

    (sim.force('link') as any).links(d3LinksRef.current);
    sim.alpha(0.2).restart();
  }, []);

  const addInvisibleNodeBackbone = useCallback((nodeIds: string[]) => {
    if (nodeIds.length < 2) return;
    const [anchor, ...rest] = nodeIds;
    rest.forEach((nodeId) => addD3Link(anchor, nodeId, false, true));
  }, [addD3Link]);

  const drawDebateLink = useCallback((sourceId: string, targetId: string, color: string) => {
    if (!svgRef.current) return;

    const source = d3NodesRef.current.find((node: any) => node.id === sourceId);
    const target = d3NodesRef.current.find((node: any) => node.id === targetId);
    if (!source || !target) return;

    const svg = d3.select(svgRef.current);
    const debateDatum = { source, target };

    svg.select('#links-layer')
      .append('line')
      .datum(debateDatum as any)
      .attr('stroke', color)
      .attr('stroke-width', 2.8)
      .attr('stroke-opacity', 0.98)
      .attr('stroke-dasharray', '10 5')
      .attr('stroke-linecap', 'round')
      .attr('stroke-dashoffset', 0)
      .attr('filter', 'url(#glow)')
      .attr('x1', source.x ?? 0)
      .attr('y1', source.y ?? 0)
      .attr('x2', target.x ?? 0)
      .attr('y2', target.y ?? 0)
      .attr('opacity', 0)
      .transition()
      .duration(140)
      .attr('opacity', 1)
      .transition()
      .duration(1400)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', -45)
      .attr('opacity', 0)
      .remove();
  }, []);

  // ── HIGHLIGHT ─────────────────────────────────────────────────────────
  const highlightAgent = useCallback((ids: string | string[]) => {
    if (!svgRef.current) return;
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    d3.select(svgRef.current).select('#nodes-layer')
      .selectAll<SVGGElement, any>('g')
      .each(function(d) {
        const el = d3.select(this);
        const circle = el.select('circle').interrupt();
        if (set.has(d.id)) {
          el.raise();
          circle
            .transition().duration(130)
            .attr('r', d.isGraphNode ? 31 : 22)
            .attr('fill-opacity', 0.98)
            .attr('filter', 'url(#glow)')
            .attr('stroke-width', d.isGraphNode ? 4.2 : 3)
            .transition().duration(220)
            .attr('r', d.isGraphNode ? 27 : 18)
            .attr('fill-opacity', 0.92)
            .attr('stroke-width', d.isGraphNode ? 3.5 : 2.5);
        } else {
          circle.transition().duration(400)
            .attr('r', d.isGraphNode ? 20 : 11)
            .attr('fill-opacity', 0.25)
            .attr('filter', null)
            .attr('stroke-width', d.isGraphNode ? 2.5 : 1.5);
        }
      });
  }, []);

  // ── FOCUS ZOOM ────────────────────────────────────────────────────────
  const focusAgents = useCallback((fromId: string, toId?: string) => {
    if (!svgRef.current || !zoomRef.current) return;
    const byId = new Map(d3NodesRef.current.map((n: any) => [n.id, n]));
    const a = byId.get(fromId);
    const b = toId ? byId.get(toId) : null;
    if (!a) return;
    const svg = d3.select(svgRef.current);
    const w = svgRef.current.clientWidth || 900;
    const h = svgRef.current.clientHeight || 520;
    const cx = b ? ((a.x ?? 0) + (b.x ?? 0)) / 2 : (a.x ?? 0);
    const cy = b ? ((a.y ?? 0) + (b.y ?? 0)) / 2 : (a.y ?? 0);
    const current = d3.zoomTransform(svgRef.current);
    const t = d3.zoomIdentity.translate(w / 2, h / 2).scale(current.k || 1).translate(-cx, -cy);
    svg.transition().duration(320).ease(d3.easeCubicOut).call(zoomRef.current.transform as any, t);
  }, []);

  // ── NODE CARD CLICK — persists selection ──────────────────────────────
  const handleNodeClick = useCallback((nodeId: string, agentIds: string[]) => {
    if (selectAllActiveRef.current) {
      setSelectAllActive(false);
    }
    const isDeselect = selectedNodeId === nodeId;

    if (isDeselect) {
      setSelectedNodeId(null);
      setSelectedAgentId(null);
      setSelectedDebateId(null);
      resetNodeStyles();
      return;
    }

    const nodeAgents = agents.filter((agent) => agentIds.includes(agent.id));
    const selectedFromNode = nodeAgents.find((agent) => agent.id === selectedAgentId) ?? nodeAgents[0] ?? null;

    setSelectedNodeId(nodeId);
    setSelectedDebateId(null);
    setSelectedAgentId(selectedFromNode?.id ?? null);

    if (selectedFromNode) {
      highlightAgent([nodeId, selectedFromNode.id]);
      focusAgents(nodeId, selectedFromNode.id);
    } else {
      highlightAgent([nodeId, ...agentIds]);
      focusAgents(nodeId);
    }
  }, [agents, focusAgents, highlightAgent, resetNodeStyles, selectedAgentId, selectedNodeId]);

  // ── AGENT CARD CLICK — focus represented node + agent ───────────────
  const handleAgentClick = useCallback((agent: Agent) => {
    if (selectAllActiveRef.current) {
      setSelectAllActive(false);
    }
    const representedNode = d3NodesRef.current.find((node: any) =>
      node.isGraphNode && (node.id === agent.represents || node.label === agent.represents)
    );
    const representedNodeId = representedNode?.id ?? null;

    setSelectedAgentId(agent.id);
    setSelectedNodeId(representedNodeId);
    setSelectedDebateId(null);

    if (representedNodeId) {
      highlightAgent([agent.id, representedNodeId]);
      focusAgents(agent.id, representedNodeId);
      return;
    }

    highlightAgent(agent.id);
    focusAgents(agent.id);
  }, [focusAgents, highlightAgent]);

  // ── DEBATE CARD CLICK — persists selection ────────────────────────────
  const handleDebateClick = useCallback((evt: DebateEvent) => {
    if (selectAllActiveRef.current) {
      setSelectAllActive(false);
    }
    setSelectedDebateId(prev => {
      const next = prev === evt.id ? null : evt.id;
      if (next) {
        setSelectedAgentId(null);
        highlightAgent([evt.fromId, evt.toId]);
        drawDebateLink(evt.fromId, evt.toId, evt.color);
        focusAgents(evt.fromId, evt.toId);
      } else {
        resetNodeStyles();
      }
      return next;
    });
    setSelectedNodeId(null);
  }, [drawDebateLink, highlightAgent, focusAgents, resetNodeStyles]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedDebateId(null);
    setSelectedAgentId(null);
    setSelectAllActive((prev) => {
      const next = !prev;
      if (next) {
        highlightAgent(d3NodesRef.current.map((node: any) => node.id));
      } else {
        resetNodeStyles();
      }
      return next;
    });
  }, [highlightAgent, resetNodeStyles]);

  const handleResetToCenter = useCallback(() => {
    if (!svgRef.current || d3NodesRef.current.length === 0) return;

    const w = svgRef.current.clientWidth || 900;
    const h = svgRef.current.clientHeight || 520;

    const graphNodes = d3NodesRef.current.filter((node: any) => node.isGraphNode);
    const groupedAgents = d3NodesRef.current
      .filter((node: any) => !node.isGraphNode)
      .reduce<Record<string, any[]>>((acc, node) => {
        const key = node.represents ?? '__unassigned__';
        (acc[key] ||= []).push(node);
        return acc;
      }, {});

    const parentPos = new Map<string, { x: number; y: number }>();
    const graphRadius = Math.min(w, h) * 0.3;
    graphNodes.forEach((node: any, index: number) => {
      const angle = (index / Math.max(1, graphNodes.length)) * Math.PI * 2;
      const x = w / 2 + Math.cos(angle) * graphRadius;
      const y = h / 2 + Math.sin(angle) * graphRadius;
      node.x = x;
      node.y = y;
      node.fx = x;
      node.fy = y;
      parentPos.set(node.id, { x, y });
      if (node.label) {
        parentPos.set(node.label, { x, y });
      }
    });

    Object.entries(groupedAgents).forEach(([represents, group]) => {
      const parent = parentPos.get(represents) ?? { x: w / 2, y: h / 2 };
      group.forEach((agent: any, index: number) => {
        const angle = (index / Math.max(1, group.length)) * Math.PI * 2;
        const distance = 72 + ((index % 4) * 14);
        const x = parent.x + Math.cos(angle) * distance;
        const y = parent.y + Math.sin(angle) * distance;
        agent.x = x;
        agent.y = y;
        agent.fx = x;
        agent.fy = y;
      });
    });

    const svg = d3.select(svgRef.current);
    svg.select('#nodes-layer').selectAll<SVGGElement, any>('g')
      .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    svg.select('#links-layer').selectAll<SVGLineElement, any>('line')
      .attr('x1', d => {
        const src = typeof d.source === 'object' ? d.source : d3NodesRef.current.find((n: any) => n.id === d.source);
        return src?.x ?? 0;
      })
      .attr('y1', d => {
        const src = typeof d.source === 'object' ? d.source : d3NodesRef.current.find((n: any) => n.id === d.source);
        return src?.y ?? 0;
      })
      .attr('x2', d => {
        const tgt = typeof d.target === 'object' ? d.target : d3NodesRef.current.find((n: any) => n.id === d.target);
        return tgt?.x ?? 0;
      })
      .attr('y2', d => {
        const tgt = typeof d.target === 'object' ? d.target : d3NodesRef.current.find((n: any) => n.id === d.target);
        return tgt?.y ?? 0;
      });

    simRef.current?.alpha(0.5).restart();

    if (releaseLayoutTimerRef.current) {
      window.clearTimeout(releaseLayoutTimerRef.current);
    }
    releaseLayoutTimerRef.current = window.setTimeout(() => {
      d3NodesRef.current.forEach((node: any) => {
        node.fx = null;
        node.fy = null;
      });
      if (phase === 'done') {
        simRef.current?.stop();
      } else {
        simRef.current?.alphaTarget(0);
      }
      releaseLayoutTimerRef.current = null;
    }, 300);

    if (selectAllActiveRef.current) {
      highlightAgent(d3NodesRef.current.map((node: any) => node.id));
    } else {
      resetNodeStyles();
    }
  }, [highlightAgent, phase, resetNodeStyles]);

  // ── SUBMIT ────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!form.topic.trim()) errs.topic = 'Topic is required.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({}); setApiError(null);
    setNodes([]); setGraphEdgesState([]); setAgents([]); setTurns([]); setDebateEvents([]);
    setSelectedNodeId(null); setSelectedDebateId(null); setSelectedAgentId(null);
    setSelectAllActive(false);
    setLastRunId(null);
    d3NodesRef.current = []; d3LinksRef.current = [];
    agentsRef.current = [];
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    localStorage.removeItem('synsoc_last_run_id');
    d3InitRef.current = false;
    setPhase('live');
  };

  const getResultsPath = useCallback(() => {
    if (!lastRunId) {
      return '/results';
    }
    return `/results?run=${encodeURIComponent(lastRunId)}`;
  }, [lastRunId]);

  useEffect(() => {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return;

    try {
      const cached = JSON.parse(raw) as Partial<SimulationWorkspaceSnapshot>;
      if (!Array.isArray(cached.nodes) || !Array.isArray(cached.agents) || !Array.isArray(cached.turns)) return;

      if (cached.form) {
        setForm((prev) => ({ ...prev, ...cached.form }));
      }
      setNodes(cached.nodes);
      setGraphEdgesState(Array.isArray(cached.edges) ? cached.edges : []);
      setAgents(cached.agents);
      setTurns(cached.turns);
      setDebateEvents(Array.isArray(cached.debateEvents) ? cached.debateEvents : []);
      setStatusMsg(cached.statusMsg ?? 'Simulation restored');
      setSelectedNodeId(null);
      setSelectedDebateId(null);
      setSelectedAgentId(null);
      d3InitRef.current = false;
      d3NodesRef.current = [];
      d3LinksRef.current = [];
      setPhase(cached.phase === 'config' ? 'config' : 'done');
    } catch {
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'done') return;
    if (nodes.length === 0 || d3InitRef.current) return;

    let rafId = 0;
    let stopTimer = 0;

    const drawFromSavedState = () => {
      if (!svgRef.current) {
        rafId = requestAnimationFrame(drawFromSavedState);
        return;
      }

      setupD3();
      d3NodesRef.current = [];
      d3LinksRef.current = [];

      const w = svgRef.current.clientWidth || 900;
      const h = svgRef.current.clientHeight || 520;

      nodes.forEach((n, i) => {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        const r = Math.min(w, h) * 0.3;
        addD3Node({ id: n.id, label: n.label, isGraphNode: true, x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r });
      });

      addInvisibleNodeBackbone(nodes.map((n) => n.id));

      const groupedAgents = agents.reduce<Record<string, Agent[]>>((acc, agent) => {
        (acc[agent.represents] ||= []).push(agent);
        return acc;
      }, {});

      Object.entries(groupedAgents).forEach(([represents, group]) => {
        const parent = d3NodesRef.current.find((n: any) => n.id === represents || n.label === represents);
        const parentId = parent?.id ?? null;
        group.forEach((agent, i) => {
          const angle = (i / Math.max(1, group.length)) * Math.PI * 2;
          const dist = 70 + ((i % 3) * 14);
          addD3Node({
            id: agent.id,
            name: agent.name,
            stance: agent.stance,
            isGraphNode: false,
            represents: agent.represents,
            x: (parent?.x ?? 450) + Math.cos(angle) * dist,
            y: (parent?.y ?? 280) + Math.sin(angle) * dist,
          });
          if (parentId) addD3Link(agent.id, parentId, true);
        });
      });

      simRef.current?.alpha(0.35).alphaTarget(0).restart();
      stopTimer = window.setTimeout(() => {
        simRef.current?.stop();
      }, 900);
    };

    rafId = requestAnimationFrame(drawFromSavedState);
    return () => {
      cancelAnimationFrame(rafId);
      if (stopTimer) window.clearTimeout(stopTimer);
    };
  }, [phase, nodes, agents, graphEdgesState, setupD3, addD3Node, addD3Link, addInvisibleNodeBackbone]);

  const handleResetSimulation = useCallback(() => {
    stopRef.current?.();
    if (releaseLayoutTimerRef.current) {
      window.clearTimeout(releaseLayoutTimerRef.current);
      releaseLayoutTimerRef.current = null;
    }
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    d3InitRef.current = false;
    d3NodesRef.current = [];
    d3LinksRef.current = [];
    setSelectAllActive(false);
    setPhase('config');
  }, []);

  // ── STREAM EFFECT ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'live') return;

    let rafId = 0;
    let stopFn: (() => void) | null = null;

    const startWhenReady = () => {
      if (!svgRef.current) { rafId = requestAnimationFrame(startWhenReady); return; }
      setupD3();

      let allAgents: Agent[] = [];
      let allTurns: SimulationTurn[] = [];
      let prevTurn: SimulationTurn | null = null;
      let graphData: any = null;
      let graphEdges: GraphEdge[] = [];
      let agentsData: any = null;
      let simData: any = null;
      let allDebateEvents: DebateEvent[] = [];

      const stop = streamPipeline(
        {
          topic: form.topic.trim(),
          context: form.context.trim() || undefined,
          rounds: form.rounds,
          agents_per_round: form.agents_per_round,
          agents_per_node: form.agents_per_node,
        },
        (event, data) => {
          if (event === 'status') { setStatusMsg(data.message); }

          else if (event === 'graph') {
            graphData = data.graph; graphEdges = data.graph.edges;
            setNodes(data.graph.nodes); setGraphEdgesState(data.graph.edges);
            setStatusMsg(`Graph extracted — ${data.graph.nodes.length} nodes`);
            const w = svgRef.current?.clientWidth || 900;
            const h = svgRef.current?.clientHeight || 520;
            data.graph.nodes.forEach((n: GraphNode, i: number) => {
              const angle = (i / data.graph.nodes.length) * Math.PI * 2;
              const r = Math.min(w, h) * 0.3;
              addD3Node({ id: n.id, label: n.label, isGraphNode: true, x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r });
            });
            addInvisibleNodeBackbone(data.graph.nodes.map((n: GraphNode) => n.id));
          }

          else if (event === 'agents_batch') {
            const newAgents: Agent[] = data.agents;
            allAgents = [...allAgents, ...newAgents];
            agentsRef.current = allAgents;
            setAgents([...allAgents]);
            setStatusMsg(`Spawning agents for ${data.node_label}... (${data.total_so_far} total)`);
            const parent = d3NodesRef.current.find(n => n.id === data.node_id);
            newAgents.forEach((a: Agent, i: number) => {
              const angle = (i / newAgents.length) * Math.PI * 2;
              const dist = 70 + Math.random() * 30;
              addD3Node({ id: a.id, name: a.name, stance: a.stance, isGraphNode: false, represents: a.represents, x: (parent?.x ?? 450) + Math.cos(angle) * dist, y: (parent?.y ?? 280) + Math.sin(angle) * dist });
              addD3Link(a.id, parent?.id ?? data.node_id, true);
            });
          }

          else if (event === 'agents_complete') {
            agentsData = { topic: form.topic, total_agents: data.total_agents, agents: allAgents };
            setStatusMsg(`${data.total_agents} agents ready — debate starting...`);
          }

          else if (event === 'round_start') { setStatusMsg(`Round ${data.round} of ${data.total_rounds}`); }

          else if (event === 'turn') {
            const turn: SimulationTurn = data.turn;
            allTurns = [...allTurns, turn];
            const color = ACTION_COLORS[turn.action] ?? EMOTION_COLORS[turn.emotion] ?? '#ffaa00';
            if (prevTurn) {
              drawDebateLink(prevTurn.agent_id, turn.agent_id, color);
              const next: DebateEvent = {
                id: `${turn.round}-${turn.agent_id}-${allDebateEvents.length}`,
                round: turn.round,
                fromId: prevTurn!.agent_id,
                fromName: prevTurn!.agent_name,
                toId: turn.agent_id,
                toName: turn.agent_name,
                action: turn.action,
                emotion: turn.emotion,
                message: turn.message,
                color,
              };
              allDebateEvents = [next, ...allDebateEvents].slice(0, 120);
              setDebateEvents([...allDebateEvents]);
            }
            prevTurn = turn;
            setTurns([...allTurns]);
            const hasPinnedSelection = Boolean(
              selectedNodeIdRef.current || selectedDebateIdRef.current || selectedAgentIdRef.current
            );
            if (!hasPinnedSelection) {
              highlightAgent(turn.agent_id);
            }
            setStatusMsg(`${turn.agent_name} is ${turn.action}... (${turn.emotion})`);
          }

          else if (event === 'simulation_complete') {
            simData = { topic: form.topic, total_rounds: form.rounds, total_turns: allTurns.length, turns: allTurns, key_tensions: data.key_tensions, dominant_stances: data.dominant_stances };
            setStatusMsg('Simulation done — generating report...');
            simRef.current?.alphaTarget(0);
            simRef.current?.stop();
          }

          else if (event === 'report') {
            const result = { topic: form.topic, graph: graphData, agents: agentsData, simulation: simData, report: data.report };
            localStorage.setItem('synsoc_pipeline_result', JSON.stringify(result));
            if (typeof data.run_id === 'string' && data.run_id) {
              setLastRunId(data.run_id);
              localStorage.setItem('synsoc_last_run_id', data.run_id);
            }
            const workspaceSnapshot: SimulationWorkspaceSnapshot = {
              phase: 'done',
              form: {
                topic: form.topic,
                context: form.context,
                rounds: form.rounds,
                agents_per_round: form.agents_per_round,
                agents_per_node: form.agents_per_node,
              },
              statusMsg: 'Report ready!',
              nodes: graphData?.nodes ?? [],
              edges: graphData?.edges ?? graphEdges,
              agents: allAgents,
              turns: allTurns,
              debateEvents: allDebateEvents,
            };
            localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceSnapshot));

            setStatusMsg('Report ready!'); setPhase('done');
            simRef.current?.alphaTarget(0);
            simRef.current?.stop();
          }

          else if (event === 'complete') {
            if (typeof data.run_id === 'string' && data.run_id) {
              setLastRunId(data.run_id);
              localStorage.setItem('synsoc_last_run_id', data.run_id);
            }
          }

          else if (event === 'error') { setApiError(data.message); setPhase('config'); }
        }
      );

      stopFn = stop; stopRef.current = stop;
    };

    rafId = requestAnimationFrame(startWhenReady);
    return () => { cancelAnimationFrame(rafId); stopFn?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const inputStyle = (field: string) => ({
    background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
    borderColor: errors[field] ? '#ef4444' : 'hsl(var(--border))',
    outline: 'none', fontFamily: 'var(--font-sans)',
  });

  const showBackendHint = Boolean(
    apiError &&
      (apiError.toLowerCase().includes('unable to reach backend') ||
        apiError.toLowerCase().includes('vite_api_base_url'))
  );

  return (
    <>
      <title>Configure Simulation — SynSoc AI</title>
      <AnimatePresence mode="wait">

        {/* CONFIG */}
        {phase === 'config' && (
          <motion.div key="config" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="container mx-auto px-4 py-16 max-w-2xl">
            <div className="mb-10">
              <span className="text-xs font-bold tracking-widest uppercase mb-3 block"
                style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}>New Simulation</span>
              <h1 className="text-3xl md:text-4xl font-bold mb-3"
                style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Configure Simulation</h1>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Watch agents spawn and debate in real time.
              </p>
            </div>
            {apiError && (
              <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: '#ef4444', background: '#ef444410' }}>
                <p className="text-sm font-bold" style={{ color: '#ef4444' }}>Simulation failed</p>
                <p className="text-xs mt-1" style={{ color: '#ef4444', opacity: 0.8 }}>{apiError}</p>
                {showBackendHint && (
                  <p className="text-xs mt-2" style={{ color: '#ef4444', opacity: 0.85 }}>
                    Start backend with: <strong>cd /Users/vaibhavgupta7047/Documents/Projects/SynScoAI &amp;&amp; source .venv/bin/activate &amp;&amp; uvicorn app.main:app --host 127.0.0.1 --port 8000</strong>
                  </p>
                )}
              </div>
            )}
            <div className="rounded-xl border p-8" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--primary) / 0.2)' }}>
              <form onSubmit={handleSubmit} className="flex flex-col gap-7">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold tracking-wider uppercase"
                    style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Topic</label>
                  <input type="text" placeholder="What societal topic to simulate?"
                    value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })}
                    className="w-full px-4 py-3 rounded-md border text-sm" style={inputStyle('topic')} />
                  {errors.topic && <span className="text-xs" style={{ color: '#ef4444' }}>{errors.topic}</span>}
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>e.g. "College fee increase", "AI replacing jobs"</span>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold tracking-wider uppercase"
                    style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
                    Context <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea placeholder="Region, background, constraints..."
                    value={form.context} onChange={e => setForm({ ...form, context: e.target.value })}
                    rows={3} className="w-full px-4 py-3 rounded-md border text-sm resize-none" style={inputStyle('context')} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'rounds', label: 'Rounds', min: 1, max: 10, hint: '1–10' },
                    { key: 'agents_per_round', label: 'Agents/Round', min: 2, max: 10, hint: '2–10' },
                    { key: 'agents_per_node', label: 'Agents/Node', min: 1, max: 6, hint: '1–6' },
                  ].map(({ key, label, min, max, hint }) => (
                    <div key={key} className="flex flex-col gap-2">
                      <label className="text-xs font-bold tracking-wider uppercase flex items-center gap-1"
                        style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
                        {label} <Info size={11} style={{ color: 'hsl(var(--muted-foreground))' }} />
                      </label>
                      <input type="number" min={min} max={max} value={(form as any)[key]}
                        onChange={e => setForm({ ...form, [key]: Number(e.target.value) })}
                        className="w-full px-3 py-3 rounded-md border text-sm" style={inputStyle(key)} />
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{hint}</span>
                    </div>
                  ))}
                </div>
                <div className="h-px" style={{ background: 'hsl(var(--border))' }} />
                <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 rounded-md font-bold text-sm"
                  style={{ fontFamily: 'var(--font-heading)', background: 'hsl(var(--primary))', color: '#0a0a0a', boxShadow: '0 0 20px hsl(var(--primary) / 0.3)' }}>
                  <Play size={15} /> Run Simulation
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* LIVE / DONE WORKSPACE */}
        {(phase === 'live' || phase === 'done') && (
          <motion.div key="workspace" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 flex flex-col" style={{ background: '#050505', zIndex: 50 }}>

            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0" style={{ borderColor: '#111' }}>
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ background: phase === 'done' ? '#00d48a' : '#00ff88' }} />
                <span className="text-base font-bold"
                  style={{ color: phase === 'done' ? '#00d48a' : '#00ff88', fontFamily: 'var(--font-sans)' }}>
                  {phase === 'done' ? 'COMPLETE' : 'LIVE'}
                </span>
                <span className="text-base" style={{ color: '#9a9a9a', fontFamily: 'var(--font-sans)' }}>{form.topic}</span>
              </div>
              <div className="flex items-center gap-5">
                  {selectAllActive && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ color: '#00ff88', background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.28)' }}>
                      select-all drag mode
                    </span>
                  )}
                <span className="text-sm" style={{ color: '#777', fontFamily: 'var(--font-sans)' }}>
                  nodes:{nodes.length} · edges:{graphEdgesState.length} · agents:{agents.length} · turns:{turns.length}
                </span>
                <span className="text-sm" style={{ color: '#b5b5b5', fontFamily: 'var(--font-sans)' }}>{statusMsg}</span>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">

              {/* LEFT SIDEBAR */}
              <aside className="w-80 border-r flex flex-col flex-shrink-0" style={{ borderColor: '#111', background: '#090909' }}>
                {/* Action buttons */}
                <div className="p-4 border-b space-y-2" style={{ borderColor: '#111' }}>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={handleResetSimulation}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-bold"
                      style={{ background: '#191919', color: '#d6d6d6', fontFamily: 'var(--font-sans)' }}>
                      New Simulation
                    </button>
                    <button type="button" onClick={() => navigate(getResultsPath())}
                      className="flex-1 px-3 py-2 rounded-md text-sm font-bold"
                      style={{ background: 'hsl(var(--primary))', color: '#0a0a0a', fontFamily: 'var(--font-sans)' }}>
                      View Report →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="px-3 py-2 rounded-md text-xs font-bold"
                      style={{
                        background: selectAllActive ? 'rgba(0,255,136,0.16)' : '#141414',
                        color: selectAllActive ? '#00ff88' : '#c7c7c7',
                        border: selectAllActive ? '1px solid rgba(0,255,136,0.38)' : '1px solid #232323',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {selectAllActive ? 'Clear Select All' : 'Select Everything'}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToCenter}
                      className="px-3 py-2 rounded-md text-xs font-bold"
                      style={{
                        background: '#141414',
                        color: '#d6d6d6',
                        border: '1px solid #232323',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Reset to Center
                    </button>
                  </div>
                  {selectAllActive && (
                    <p className="text-[11px] leading-relaxed" style={{ color: '#86dcb6', fontFamily: 'var(--font-sans)' }}>
                      Drag any node or agent to move the entire layout together.
                    </p>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">

                  {/* Legend */}
                  <section className="rounded-lg border" style={{ borderColor: '#1a1a1a', background: '#0c0c0c' }}>
                    <button type="button"
                      onClick={() => setSections(p => ({ ...p, legend: !p.legend }))}
                      className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <span className="text-base font-bold" style={{ color: '#e3e3e3', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>
                        Debate Pulse Legend
                      </span>
                      <span style={{ color: '#666', fontSize: '18px' }}>{sections.legend ? '−' : '+'}</span>
                    </button>
                    {sections.legend && (
                      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                        {Object.entries(ACTION_COLORS).map(([action, color]) => (
                          <div key={action} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span style={{ color: '#c0c0c0', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>{action}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Nodes & Agents roster */}
                  <section className="rounded-lg border" style={{ borderColor: '#1a1a1a', background: '#0c0c0c' }}>
                    <button type="button"
                      onClick={() => setSections(p => ({ ...p, roster: !p.roster }))}
                      className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <span className="text-base font-bold" style={{ color: '#e3e3e3', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>
                        Nodes & Agents
                      </span>
                      <span style={{ color: '#666', fontSize: '18px' }}>{sections.roster ? '−' : '+'}</span>
                    </button>
                    {sections.roster && (
                      <div className="px-3 pb-3 space-y-2">
                        {nodes.map(node => {
                          const nodeAgents = agents.filter(a => a.represents === node.id || a.represents === node.label);
                          const agentIds = nodeAgents.map(a => a.id);
                          const isSelected = selectedNodeId === node.id;
                          return (
                            <div key={node.id}
                              className="w-full rounded-lg border p-3 text-left transition-all duration-150"
                              style={{
                                borderColor: isSelected ? '#00ff88' : '#1f1f1f',
                                background: isSelected ? 'rgba(0,255,136,0.16)' : '#0f0f0f',
                                boxShadow: isSelected ? '0 0 0 1px rgba(0,255,136,0.45), 0 0 28px rgba(0,255,136,0.18)' : 'none',
                                transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                              }}>
                              <button type="button"
                                onClick={() => handleNodeClick(node.id, agentIds)}
                                className="w-full text-left">
                                <div className="flex items-center gap-2 mb-1">
                                  {isSelected && (
                                    <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: '#00ff88' }} />
                                  )}
                                  <p style={{ color: isSelected ? '#00ff88' : '#f0f0f0', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em', fontFamily: 'var(--font-sans)' }}>
                                    {node.label}
                                  </p>
                                </div>
                                <p style={{ color: '#888', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>
                                  {nodeAgents.length} agents{isSelected ? ' · selected' : ''}
                                </p>
                              </button>

                              {isSelected && nodeAgents.length > 0 && (
                                <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: '#1f1f1f' }}>
                                  {nodeAgents.map((agent) => {
                                    const isAgentSelected = selectedAgentId === agent.id;
                                    const latestTurn = latestTurnByAgent[agent.id];
                                    return (
                                      <button
                                        key={agent.id}
                                        type="button"
                                        onClick={() => handleAgentClick(agent)}
                                        className="w-full rounded-md border p-2.5 text-left transition-all duration-150"
                                        style={{
                                          borderColor: isAgentSelected ? '#00ff88' : '#252525',
                                          background: isAgentSelected ? 'rgba(0,255,136,0.14)' : '#0d0d0d',
                                          boxShadow: isAgentSelected ? '0 0 0 1px rgba(0,255,136,0.35)' : 'none',
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <div className="flex items-center gap-2">
                                            {isAgentSelected && (
                                              <span className="relative inline-flex h-2.5 w-2.5">
                                                <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: '#00ff88', opacity: 0.45 }} />
                                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: '#00ff88' }} />
                                              </span>
                                            )}
                                            <p className="text-sm font-bold" style={{ color: isAgentSelected ? '#00ff88' : '#e8e8e8', fontFamily: 'var(--font-sans)' }}>
                                              {agent.name}
                                            </p>
                                          </div>
                                          <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ color: STANCE_COLORS[agent.stance] ?? '#a8a8a8', background: '#121212' }}>
                                            {agent.stance.replace(/_/g, ' ')}
                                          </span>
                                        </div>
                                        <p className="text-xs leading-relaxed" style={{ color: '#a8a8a8', fontFamily: 'var(--font-sans)' }}>
                                          {shortMsg(latestTurn?.message ?? agent.goal, 110)}
                                        </p>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {selectedAgent && (
                          <div className="rounded-lg border p-3" style={{ borderColor: '#2b2b2b', background: '#0d0d0d' }}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-sm font-bold" style={{ color: '#f0f0f0', fontFamily: 'var(--font-sans)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {selectedAgent.name}
                              </p>
                              <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ color: STANCE_COLORS[selectedAgent.stance] ?? '#a8a8a8', background: '#131313' }}>
                                {selectedAgent.stance.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="text-xs mb-2" style={{ color: '#7f7f7f', fontFamily: 'var(--font-sans)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              {selectedAgent.represents}
                            </p>
                            <div className="rounded-md border p-2" style={{ borderColor: '#242424', background: '#101010' }}>
                              <p className="text-[10px] uppercase mb-1" style={{ color: '#7f7f7f', fontFamily: 'var(--font-sans)' }}>
                                Latest argument
                              </p>
                              <p className="text-xs leading-relaxed" style={{ color: '#d0d0d0', fontFamily: 'var(--font-sans)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {selectedAgentTurns[0]?.message ?? selectedAgent.goal}
                              </p>
                            </div>
                          </div>
                        )}

                        {nodes.length === 0 && (
                          <p style={{ color: '#3a3a3a', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>Extracting graph...</p>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Debate timeline */}
                  <section className="rounded-lg border" style={{ borderColor: '#1a1a1a', background: '#0c0c0c' }}>
                    <button type="button"
                      onClick={() => setSections(p => ({ ...p, timeline: !p.timeline }))}
                      className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <span className="text-base font-bold" style={{ color: '#e3e3e3', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>
                        Debate Timeline
                      </span>
                      <span style={{ color: '#666', fontSize: '18px' }}>{sections.timeline ? '−' : '+'}</span>
                    </button>
                    {sections.timeline && (
                      <div className="px-3 pb-3 space-y-2">
                        {debateEvents.length === 0 && (
                          <p style={{ color: '#3a3a3a', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>No debate events yet.</p>
                        )}
                        {debateEvents.map(evt => {
                          const isSelected = selectedDebateId === evt.id;
                          return (
                            <button key={evt.id} type="button"
                              onClick={() => handleDebateClick(evt)}
                              className="w-full text-left rounded-lg border p-3 transition-all duration-150"
                              style={{
                                borderColor: isSelected ? evt.color : '#1f1f1f',
                                background: isSelected ? `${evt.color}18` : '#0f0f0f',
                                boxShadow: isSelected ? `0 0 0 1px ${evt.color}55, 0 0 22px ${evt.color}26` : 'none',
                                transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                              }}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: evt.color }} />
                                <span style={{ color: isSelected ? evt.color : '#f0f0f0', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.01em', fontFamily: 'var(--font-sans)' }}>
                                  R{evt.round}: {formatLabel(evt.fromName)} → {formatLabel(evt.toName)}
                                </span>
                              </div>
                              <p style={{ color: '#888', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>
                                {evt.action} · {evt.emotion}
                              </p>
                              <p style={{ color: '#b0b0b0', fontSize: '14px', lineHeight: '1.55', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
                                {shortMsg(evt.message, 120)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </aside>

              {/* D3 CANVAS */}
              <div className="flex-1 relative min-w-0">
                <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />

                {selectedAgent && (
                  <div className="absolute left-4 top-4 z-20 w-[360px] rounded-xl border bg-black/85 p-4 shadow-2xl backdrop-blur-md pointer-events-auto" style={{ borderColor: '#2d2d2d' }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-base font-bold" style={{ color: '#f6f6f6', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                          {selectedAgent.name}
                        </p>
                        <p className="text-xs" style={{ color: '#9b9b9b', fontFamily: 'var(--font-sans)' }}>
                          Live argument trace
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedAgentId(null)}
                        className="rounded-md px-2.5 py-1 text-xs font-bold"
                        style={{ background: '#171717', color: '#bebebe', fontFamily: 'var(--font-sans)' }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3" style={{ fontFamily: 'var(--font-sans)' }}>
                      <div className="rounded-md border p-2" style={{ borderColor: '#262626', background: '#111' }}>
                        <p style={{ color: '#7b7b7b' }}>Stance</p>
                        <p style={{ color: STANCE_COLORS[selectedAgent.stance] ?? '#f1f1f1', fontSize: '13px', fontWeight: 700 }}>{selectedAgent.stance}</p>
                      </div>
                      <div className="rounded-md border p-2" style={{ borderColor: '#262626', background: '#111' }}>
                        <p style={{ color: '#7b7b7b' }}>Represents</p>
                        <p style={{ color: '#f1f1f1', fontSize: '13px', fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{selectedAgent.represents}</p>
                      </div>
                    </div>
                    <div className="rounded-md border p-3 mb-3" style={{ borderColor: '#262626', background: '#101010' }}>
                      <p className="text-xs mb-1" style={{ color: '#7b7b7b', fontFamily: 'var(--font-sans)' }}>Goal</p>
                      <p className="text-sm" style={{ color: '#dfdfdf', lineHeight: '1.55', fontFamily: 'var(--font-sans)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{selectedAgent.goal}</p>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {selectedAgentTurns.length === 0 && (
                        <p className="text-sm" style={{ color: '#6c6c6c', fontFamily: 'var(--font-sans)' }}>
                          No arguments recorded yet.
                        </p>
                      )}
                      {selectedAgentTurns.map((turn) => (
                        <div key={`${turn.round}-${turn.agent_id}-${turn.action}`} className="rounded-md border p-3" style={{ borderColor: '#262626', background: '#0f0f0f' }}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-bold" style={{ color: ACTION_COLORS[turn.action] ?? '#f1f1f1', fontFamily: 'var(--font-sans)' }}>
                              R{turn.round} · {turn.action}
                            </span>
                            <span className="text-xs" style={{ color: '#7d7d7d', fontFamily: 'var(--font-sans)' }}>
                              {turn.emotion}
                            </span>
                          </div>
                          <p className="text-sm" style={{ color: '#d7d7d7', lineHeight: '1.55', fontFamily: 'var(--font-sans)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {turn.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stance legend */}
                <div className="absolute top-4 right-4 flex flex-col gap-1.5 pointer-events-none">
                  {Object.entries(STANCE_COLORS).map(([s, c]) => (
                    <div key={s} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span style={{ color: '#666', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>
                        {s.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>

                {nodes.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span style={{ color: '#2a2a2a', fontFamily: 'var(--font-sans)', fontSize: '16px' }}>
                      extracting knowledge graph...
                    </span>
                  </div>
                )}

                {/* Done overlay */}
                {phase === 'done' && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
                    <button onClick={() => navigate(getResultsPath())}
                      className="px-6 py-3 rounded-lg font-bold text-sm"
                      style={{ background: 'hsl(var(--primary))', color: '#0a0a0a', fontFamily: 'var(--font-sans)', boxShadow: '0 0 20px hsl(var(--primary)/0.4)' }}>
                      View Full Report →
                    </button>
                    <button onClick={handleResetSimulation}
                      className="px-6 py-3 rounded-lg font-bold text-sm border"
                      style={{ borderColor: '#333', color: '#aaa', fontFamily: 'var(--font-sans)' }}>
                      New Simulation
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </>
  );
}