import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { Agent, GraphEdge, SimulationTurn } from '../lib/api-client';

interface Props {
  agents: Agent[];
  edges: GraphEdge[];
  turns: SimulationTurn[];
  activeTurnIndex: number;
}

const STANCE_COLORS: Record<string, string> = {
  strongly_for: '#00ff88',
  for: '#00cc66',
  neutral: '#888888',
  against: '#ff4444',
  strongly_against: '#cc0000',
};

export default function AgentNetworkGraph({ agents, edges, turns, activeTurnIndex }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<any>(null);
  const stopTimerRef = useRef<number | null>(null);
  const activeTurn = turns[activeTurnIndex] ?? null;

  useEffect(() => {
    if (!svgRef.current || agents.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 600;
    const height = svgRef.current.clientHeight || 340;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const groups = Array.from(new Set(agents.map(a => a.represents)));
    const nodes: any[] = agents.map(a => ({ ...a }));

    const links: any[] = [];
    edges.forEach(e => {
      const sources = agents.filter(a => a.represents === e.source);
      const targets = agents.filter(a => a.represents === e.target);
      sources.forEach(s => {
        targets.forEach(t => {
          links.push({ source: s.id, target: t.id, weight: e.weight });
        });
      });
    });

    groups.forEach(group => {
      const groupAgents = agents.filter(a => a.represents === group);
      for (let i = 0; i < groupAgents.length - 1; i++) {
        links.push({ source: groupAgents[i].id, target: groupAgents[i + 1].id, weight: 0.3, internal: true });
      }
    });

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'coloredBlur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    const link = svg.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', (d: any) => d.internal ? '#1a1a1a' : '#333')
      .attr('stroke-width', (d: any) => d.internal ? 0.5 : d.weight * 1.5)
      .attr('stroke-opacity', (d: any) => d.internal ? 0.4 : 0.6);

    const node = svg.append('g')
      .selectAll('g').data(nodes).join('g')
      .attr('cursor', 'pointer');

    node.append('circle')
      .attr('r', 9)
      .attr('fill', (d: any) => STANCE_COLORS[d.stance] ?? '#888')
      .attr('fill-opacity', 0.18)
      .attr('stroke', (d: any) => STANCE_COLORS[d.stance] ?? '#888')
      .attr('stroke-width', 1.5);

    node.append('text')
      .text((d: any) => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', 20)
      .attr('font-size', '7px')
      .attr('fill', '#888')
      .attr('font-family', 'monospace');

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id)
        .distance((d: any) => d.internal ? 30 : 90).strength(0.25))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(18))
      .alphaDecay(0.06);

    simRef.current = sim;

    const scheduleStop = (delay = 850) => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = window.setTimeout(() => {
        sim.alphaTarget(0);
        sim.stop();
        stopTimerRef.current = null;
      }, delay);
    };

    node.call(
      d3.drag<any, any>()
        .on('start', (event, d) => {
          if (stopTimerRef.current) {
            window.clearTimeout(stopTimerRef.current);
            stopTimerRef.current = null;
          }
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) {
            sim.alphaTarget(0);
            scheduleStop(700);
          }
          d.fx = null; d.fy = null;
        })
    );

    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    scheduleStop(1200);

    return () => {
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      sim.stop();
    };
  }, [agents, edges]);

  useEffect(() => {
    if (!svgRef.current || !activeTurn) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, any>('circle')
      .attr('fill-opacity', d => d.id === activeTurn.agent_id ? 0.9 : 0.18)
      .attr('r', d => d.id === activeTurn.agent_id ? 15 : 9)
      .attr('filter', d => d.id === activeTurn.agent_id ? 'url(#glow)' : null);
  }, [activeTurnIndex, activeTurn]);

  return (
    // ── Outer wrapper: flex column so bubble is BELOW the graph, not on top ──
    <div className="flex flex-col w-full h-full">

      {/* Graph takes remaining space */}
      <div className="relative flex-1 min-h-0">
        <svg ref={svgRef} width="100%" height="100%" style={{ background: 'transparent', display: 'block' }} />

        {/* Legend — top right inside graph area */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 pointer-events-none">
          {Object.entries(STANCE_COLORS).map(([stance, color]) => (
            <div key={stance} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <span style={{ color: '#555', fontSize: '8px', fontFamily: 'monospace' }}>
                {stance.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bubble is OUTSIDE the SVG — sits below, no overlap */}
      {activeTurn ? (
        <div
          className="flex-shrink-0 mx-3 mb-3 p-3 rounded-lg border text-xs"
          style={{
            background: 'rgba(0,0,0,0.92)',
            borderColor: STANCE_COLORS[activeTurn.stance] ?? '#444',
            color: '#fff',
            fontFamily: 'monospace',
          }}
        >
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: STANCE_COLORS[activeTurn.stance] ?? '#888' }} />
            <span style={{ color: STANCE_COLORS[activeTurn.stance] ?? '#888', fontWeight: 700 }}>
              {activeTurn.agent_name}
            </span>
            <span style={{ color: '#444' }}>·</span>
            <span style={{ color: '#666' }}>{activeTurn.represents}</span>
            <span style={{ color: '#444' }}>·</span>
            <span style={{ color: '#666' }}>{activeTurn.emotion}</span>
            <span style={{ color: '#444' }}>·</span>
            <span style={{ color: '#555' }}>{activeTurn.action}</span>
          </div>
          <p style={{ color: '#bbb', lineHeight: 1.5 }}>{activeTurn.message}</p>
        </div>
      ) : (
        /* Placeholder so layout doesn't jump */
        <div className="flex-shrink-0 mx-3 mb-3 h-16 rounded-lg border flex items-center justify-center"
          style={{ borderColor: '#222', borderStyle: 'dashed' }}>
          <span style={{ color: '#444', fontSize: '10px', fontFamily: 'monospace' }}>
            Use ← → to step through agent turns
          </span>
        </div>
      )}
    </div>
  );
}