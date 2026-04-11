import { useEffect, useState, } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { BarChart3, Users, Terminal, FileText, ArrowLeft, Network } from 'lucide-react';
import { downloadRunExport, fetchRun } from '../lib/api-client';
import type { PipelineResponse } from '../lib/api-client';
import AgentNetworkGraph from '../components/AgentNetworkGraph';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';

const STANCE_COLORS: Record<string, string> = {
  strongly_for: '#00ff88',
  for: '#00cc66',
  neutral: '#888888',
  against: '#ff6644',
  strongly_against: '#ff2222',
};

const STANCE_LABELS: Record<string, string> = {
  strongly_for: 'Pro',
  for: 'Pro',
  neutral: 'Neutral',
  against: 'Con',
  strongly_against: 'Con',
};

const EMOTION_COLORS: Record<string, string> = {
  calm: '#00cc66',
  hopeful: '#00aaff',
  firm: '#ffaa00',
  frustrated: '#ff6644',
  angry: '#ff2222',
  concerned: '#aa88ff',
};

type Tab = 'graph' | 'network' | 'agents' | 'transcript' | 'report';

function computeConflictScore(turns: any[]): number {
  if (!turns || turns.length === 0) return 0;
  const stanceWeights: Record<string, number> = {
    strongly_for: 1, for: 0.5, neutral: 0, against: -0.5, strongly_against: -1,
  };
  const scores = turns.map((t) => stanceWeights[t.stance] ?? 0);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
  return Math.min(1, Math.sqrt(variance));
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = 60; const cx = 80; const cy = 80; const strokeWidth = 22;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const slice = { ...d, dash, gap, offset };
    offset += dash;
    return slice;
  });
  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
        {slices.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
            strokeWidth={strokeWidth} strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset} opacity={0.9} />
        ))}
        <circle cx={cx} cy={cy} r={r - strokeWidth / 2 - 2} fill="none"
          stroke="hsl(var(--border))" strokeWidth={1} />
      </svg>
      <div className="flex flex-col gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
            <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>{d.label}</span>
            <span className="text-xs font-bold ml-auto pl-4"
              style={{ color: d.color, fontFamily: 'var(--font-heading)' }}>
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConflictGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => { const t = setTimeout(() => setAnimated(score), 300); return () => clearTimeout(t); }, [score]);
  const angle = animated * 180 - 90;
  const color = score < 0.3 ? '#00ff88' : score < 0.6 ? '#ffaa00' : score < 0.8 ? '#ff6644' : '#ff2222';
  const label = score < 0.3 ? 'Low' : score < 0.5 ? 'Moderate' : score < 0.75 ? 'High' : 'Extreme';
  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--border))" strokeWidth="16" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${animated * 251.2} 251.2`} style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s ease' }} />
        <g transform={`rotate(${angle}, 100, 100)`} style={{ transition: 'transform 1s ease' }}>
          <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="100" cy="100" r="5" fill={color} />
        </g>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => {
          const a = v * 180 - 90; const rad = (a * Math.PI) / 180;
          return <line key={v} x1={100 + 72 * Math.cos(rad)} y1={100 + 72 * Math.sin(rad)}
            x2={100 + 82 * Math.cos(rad)} y2={100 + 82 * Math.sin(rad)} stroke="hsl(var(--border))" strokeWidth="2" />;
        })}
        {['Low', '', 'Mid', '', 'High'].map((t, i) => t ? (
          <text key={i} x={100 + 56 * Math.cos(((i * 45 - 90) * Math.PI) / 180)}
            y={100 + 56 * Math.sin(((i * 45 - 90) * Math.PI) / 180)}
            textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="hsl(var(--muted-foreground))">{t}</text>
        ) : null)}
      </svg>
      <div className="flex items-baseline gap-1 -mt-2">
        <span className="text-3xl font-bold" style={{ color, fontFamily: 'var(--font-heading)', transition: 'color 0.5s' }}>
          {score.toFixed(2)}
        </span>
        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>/ 1.0 · {label}</span>
      </div>
    </div>
  );
}

function HBarChart({ data }: { data: { label: string; value: number; max: number; color: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs w-24 flex-shrink-0 text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>{d.label}</span>
          <div className="flex-1 h-2 rounded-full" style={{ background: 'hsl(var(--border))' }}>
            <div className="h-full rounded-full" style={{ width: `${(d.value / d.max) * 100}%`, background: d.color, transition: 'width 1s ease' }} />
          </div>
          <span className="text-xs font-bold w-8" style={{ color: d.color, fontFamily: 'var(--font-heading)' }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

type RecommendationBucket = 'must' | 'conditional' | 'avoid';

function getConflictMeta(score: number) {
  if (score < 0.3) return { color: '#00ff88', label: 'Low', band: 'stable' };
  if (score < 0.6) return { color: '#ffaa00', label: 'Moderate', band: 'friction' };
  if (score < 0.8) return { color: '#ff6644', label: 'High', band: 'heated' };
  return { color: '#ff2222', label: 'Extreme', band: 'critical' };
}

function firstSentence(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const index = normalized.search(/[.!?]/);
  return index >= 0 ? normalized.slice(0, index + 1) : normalized;
}

function clampText(text: string, max = 140) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function extractQuotedText(text: string) {
  const match = text.match(/[“"]([^”"]+)[”"]/);
  if (match?.[1]) return match[1].trim();
  const sentence = firstSentence(text);
  return sentence || text;
}

function classifyRecommendation(text: string): RecommendationBucket {
  const lower = text.toLowerCase();
  if (/(avoid|refus|ban|stop[- ]?use|stop[- ]?work|no use|not use|paper precaution|vague carveout)/.test(lower)) {
    return 'avoid';
  }
  if (/(conditional|only when|only where|where|when|under strict|tailoring|carve-out|verifiab)/.test(lower)) {
    return 'conditional';
  }
  return 'must';
}

function getStanceGroup(stance: string) {
  if (stance.includes('for')) return 'pro';
  if (stance === 'neutral') return 'neutral';
  return 'con';
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('run');
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'docx' | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('graph');
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadResult = async () => {
      setLoadError(null);

      if (runId) {
        try {
          const runPayload = await fetchRun(runId);
          if (cancelled) return;

          setData(runPayload.result);
          localStorage.setItem('synsoc_pipeline_result', JSON.stringify(runPayload.result));
          localStorage.setItem('synsoc_last_run_id', runPayload.run_id);
          return;
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : 'Unable to load run from server.';
          setLoadError(message);
        }
      }

      const stored = localStorage.getItem('synsoc_pipeline_result');
      if (!stored) {
        navigate('/simulate');
        return;
      }

      try {
        setData(JSON.parse(stored));
      } catch {
        navigate('/simulate');
      }
    };

    loadResult();
    return () => {
      cancelled = true;
    };
  }, [navigate, runId]);

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!runId) {
      setLoadError('Run ID is required for server export. Re-run the simulation from the live pipeline.');
      return;
    }

    setExportingFormat(format);
    try {
      const blob = await downloadRunExport(runId, format);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `synsoc-run-${runId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.';
      setLoadError(message);
    } finally {
      setExportingFormat(null);
    }
  };

  if (!data) return null;

  const { graph, agents, simulation, report } = data;
  const dynamicConflictScore = computeConflictScore(simulation.turns);
  const conflictMeta = getConflictMeta(dynamicConflictScore);
  const graphNodeLabelById = graph.nodes.reduce((acc: Record<string, string>, node) => {
    acc[node.id] = node.label;
    return acc;
  }, {});
  const agentNames = agents.agents.map((agent) => agent.name);
  const summaryLead = firstSentence(report.predicted_outcome) || firstSentence(report.executive_summary) || report.executive_summary;
  const compromiseLead = report.consensus_areas[0] ?? report.policy_recommendations[0] ?? 'Conditional compromise remains the likely landing zone.';

  const visualSummary = [
    {
      label: 'Dominant outcome',
      title: summaryLead,
      accent: 'hsl(var(--primary))',
      footnote: `${simulation.total_turns} turns · ${simulation.total_rounds} rounds`,
    },
    {
      label: 'Conflict',
      title: `${dynamicConflictScore.toFixed(2)} / 1.0`,
      accent: conflictMeta.color,
      footnote: conflictMeta.label,
    },
    {
      label: 'Compromise path',
      title: clampText(compromiseLead, 120),
      accent: '#00ff88',
      footnote: 'Most repeatable common ground',
    },
  ];

  const evidenceCards = report.key_findings.map((finding, index) => {
    const names = agentNames.filter((name) => finding.includes(name)).slice(0, 3);
    return {
      id: index,
      label: `Evidence ${String(index + 1).padStart(2, '0')}`,
      title: clampText(firstSentence(finding), 120),
      quote: clampText(extractQuotedText(finding), 160),
      names,
      accent: index % 2 === 0 ? '#00ff88' : '#ffaa00',
      text: finding,
    };
  });

  const recommendationBuckets = report.policy_recommendations.reduce<Record<RecommendationBucket, string[]>>(
    (acc, recommendation) => {
      acc[classifyRecommendation(recommendation)].push(recommendation);
      return acc;
    },
    { must: [], conditional: [], avoid: [] }
  );

  const coalitionBuckets = report.stakeholder_insights.reduce<Record<'pro' | 'neutral' | 'con', typeof report.stakeholder_insights>>(
    (acc, insight) => {
      const bucket = getStanceGroup(insight.final_stance);
      acc[bucket].push(insight);
      return acc;
    },
    { pro: [], neutral: [], con: [] }
  );

  const coalitionCards = (Object.entries(coalitionBuckets) as Array<[keyof typeof coalitionBuckets, typeof report.stakeholder_insights]>).map(
    ([bucket, insights]) => ({
      bucket,
      label: bucket === 'pro' ? 'Pro' : bucket === 'neutral' ? 'Neutral' : 'Con',
      color: bucket === 'pro' ? '#00ff88' : bucket === 'neutral' ? '#888888' : '#ff4444',
      insights: [...insights].sort((a, b) => b.influence_score - a.influence_score),
    })
  );

  const scenarioLadder = [
    { year: 'Year 1', title: 'Evidence gate hardens', note: 'Audit-grade proof becomes the baseline demand.', color: '#ff6644' },
    { year: 'Year 2', title: 'Restriction camp consolidates', note: 'High-risk uses face sharper screening and more refusal pressure.', color: '#ffaa00' },
    { year: 'Year 3', title: 'Function-test debate intensifies', note: 'Narrow tailoring survives only where it can be proven end-to-end.', color: '#888888' },
    { year: 'Year 4', title: 'Conditional carve-outs emerge', note: 'Some uses remain possible only with non-waivable gates and audit trails.', color: '#00cc66' },
    { year: 'Year 5', title: 'Procurement standard settles', note: 'The regime converges around verifiable accountability and enforcement.', color: '#00ff88' },
  ];

  const stanceCounts = agents.agents.reduce((acc: Record<string, number>, a: any) => {
    const g = a.stance?.includes('for') ? 'Pro' : a.stance === 'neutral' ? 'Neutral' : 'Con';
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});
  const donutData = [
    { label: 'Pro', value: stanceCounts['Pro'] ?? 0, color: '#00ff88' },
    { label: 'Neutral', value: stanceCounts['Neutral'] ?? 0, color: '#888888' },
    { label: 'Con', value: stanceCounts['Con'] ?? 0, color: '#ff4444' },
  ].filter((d) => d.value > 0);

  const emotionCounts = simulation.turns.reduce((acc: Record<string, number>, t: any) => {
    acc[t.emotion] = (acc[t.emotion] ?? 0) + 1; return acc;
  }, {});
  const maxEmotion = Math.max(...Object.values(emotionCounts as Record<string, number>));
  const emotionBar = Object.entries(emotionCounts as Record<string, number>)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, value]) => ({ label, value, max: maxEmotion, color: EMOTION_COLORS[label] ?? '#888' }));

  const roundMap: Record<number, { pro: number; con: number; neutral: number }> = {};
  simulation.turns.forEach((t: any) => {
    if (!roundMap[t.round]) roundMap[t.round] = { pro: 0, con: 0, neutral: 0 };
    const g = t.stance?.includes('for') ? 'pro' : t.stance === 'neutral' ? 'neutral' : 'con';
    roundMap[t.round][g]++;
  });
  const rounds = Object.keys(roundMap).map(Number).sort();

  const stanceGroups = simulation.turns.reduce((acc: Record<string, number>, t: any) => {
    const group = t.stance?.includes('for') ? 'pro' : t.stance === 'neutral' ? 'neutral' : 'con';
    acc[group] = (acc[group] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);
  const total = simulation.total_turns;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'graph', label: 'Graph', icon: BarChart3 },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'agents', label: 'Agents', icon: Users },
    { id: 'transcript', label: 'Transcript', icon: Terminal },
    { id: 'report', label: 'Report', icon: FileText },
  ];

  return (
    <>
      <title>Simulation Results — SynSoc AI</title>
      <section className="relative min-h-screen overflow-hidden">
      <ThemeAnimatedBackground className="fixed inset-0" />

      <div className="relative z-10 container mx-auto px-4 py-10 max-w-7xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <button onClick={() => navigate('/simulate')}
            className="flex items-center gap-1.5 text-xs mb-6 transition-opacity hover:opacity-70"
            style={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'var(--font-heading)' }}>
            <ArrowLeft size={12} /> Back to Simulation
          </button>
          <span className="text-xs font-bold tracking-widest uppercase mb-2 block"
            style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>
            Simulation Complete
          </span>
          <h1 className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>
            Simulation Results
          </h1>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Topic: <span style={{ color: 'hsl(var(--primary))' }}>{data.topic}</span> · {simulation.total_rounds} rounds · {agents.total_agents} agents
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={!runId || !!exportingFormat}
              className="px-3 py-2 rounded-md text-xs font-bold disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-heading)',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              {exportingFormat === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={() => handleExport('docx')}
              disabled={!runId || !!exportingFormat}
              className="px-3 py-2 rounded-md text-xs font-bold disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-heading)',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              {exportingFormat === 'docx' ? 'Exporting DOCX...' : 'Export DOCX'}
            </button>
          </div>
          {loadError && (
            <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>
              {loadError}
            </p>
          )}
        </motion.div>

        <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: 'hsl(var(--card))' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all duration-200"
                style={{
                  fontFamily: 'var(--font-heading)',
                  background: activeTab === tab.id ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                  color: activeTab === tab.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  border: `1px solid ${activeTab === tab.id ? 'hsl(var(--primary) / 0.3)' : 'transparent'}`,
                }}>
                <Icon size={12} />{tab.label}
              </button>
            );
          })}
        </div>

        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

          {/* GRAPH TAB */}
          {activeTab === 'graph' && (
            <div className="flex flex-col gap-4">
              <div className="p-6 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <h2 className="text-sm font-bold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Agent Stance Distribution</h2>
                <p className="text-xs mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>Final stance breakdown across {agents.total_agents} agents after {simulation.total_rounds} rounds</p>
                <div className="flex items-end gap-6 justify-center h-36">
                  {[{ key: 'pro', label: 'Pro', color: '#00ff88' }, { key: 'neutral', label: 'Neutral', color: '#888' }, { key: 'con', label: 'Con', color: '#ff4444' }].map(({ key, label, color }) => {
                    const count = stanceGroups[key] ?? 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={key} className="flex flex-col items-center gap-2 flex-1">
                        <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
                        <div className="w-full rounded-t-sm transition-all duration-700"
                          style={{ background: color, height: `${Math.max(pct, 4)}%`, minHeight: count > 0 ? '8px' : '0', opacity: 0.85 }} />
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-6 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Conflict Score</h2>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Measure of agent opinion divergence</p>
                  </div>
                  <span className="text-2xl font-bold" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>{dynamicConflictScore.toFixed(2)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--border))' }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${dynamicConflictScore * 100}%`, background: 'linear-gradient(90deg, #00ff88, #ff4444)' }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No conflict</span>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Extreme conflict</span>
                </div>
              </div>
              <div className="p-6 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <h2 className="text-sm font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Key Tensions</h2>
                <div className="flex flex-col gap-2">
                  {simulation.key_tensions.map((t: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-3 rounded-md" style={{ background: 'hsl(var(--primary) / 0.05)' }}>
                      <span style={{ color: 'hsl(var(--primary))', flexShrink: 0 }}>⚡</span>
                      <span style={{ color: 'hsl(var(--foreground))' }}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NETWORK TAB — fixed: no overflow-hidden, increased height, bubble below graph */}
          {activeTab === 'network' && (
            <div className="rounded-xl border flex flex-col"
              style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', height: '640px' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
                style={{ borderColor: 'hsl(var(--border))' }}>
                <div>
                  <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}>Agent Network</h2>
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{agents.total_agents} agents · drag nodes · step through turns</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setActiveTurnIndex((i) => Math.max(0, i - 1))}
                    disabled={activeTurnIndex === 0}
                    className="px-2 py-1 rounded text-xs disabled:opacity-30"
                    style={{ border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}>←</button>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Turn {activeTurnIndex + 1} / {simulation.turns.length}
                  </span>
                  <button onClick={() => setActiveTurnIndex((i) => Math.min(simulation.turns.length - 1, i + 1))}
                    disabled={activeTurnIndex === simulation.turns.length - 1}
                    className="px-2 py-1 rounded text-xs disabled:opacity-30"
                    style={{ border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}>→</button>
                </div>
              </div>
              {/* Graph + bubble — AgentNetworkGraph handles its own flex layout */}
              <div className="flex-1 min-h-0">
                <AgentNetworkGraph
                  agents={agents.agents}
                  edges={graph.edges}
                  turns={simulation.turns}
                  activeTurnIndex={activeTurnIndex}
                />
              </div>
            </div>
          )}

          {/* AGENTS TAB */}
          {activeTab === 'agents' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{agents.total_agents} agents deployed across {simulation.total_rounds} rounds</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {agents.agents.map((agent: any) => (
                  <div key={agent.id} className="p-4 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{agent.name}</p>
                        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{agent.represents}</p>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{ background: `${STANCE_COLORS[agent.stance]}22`, color: STANCE_COLORS[agent.stance] ?? '#888', border: `1px solid ${STANCE_COLORS[agent.stance]}44` }}>
                        {STANCE_LABELS[agent.stance] ?? agent.stance}
                      </span>
                    </div>
                    <div className="h-0.5 w-full rounded mb-2" style={{ background: STANCE_COLORS[agent.stance] ?? '#888', opacity: 0.4 }} />
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{agent.personality}</p>
                    <p className="text-xs mt-1 font-medium" style={{ color: 'hsl(var(--foreground))', opacity: 0.7 }}>{agent.id.toUpperCase()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRANSCRIPT TAB */}
          {activeTab === 'transcript' && (
            <div className="rounded-xl border overflow-hidden" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-80" />
                  <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
                </div>
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}>synsoc-sim — transcript.log</span>
              </div>
              <div className="p-4 overflow-y-auto flex flex-col gap-4" style={{ maxHeight: '520px', fontFamily: 'monospace' }}>
                {simulation.turns.map((turn: any, i: number) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold" style={{ color: 'hsl(var(--primary))' }}>[ROUND {turn.round}]</span>
                      <span className="text-xs font-bold" style={{ color: STANCE_COLORS[turn.stance] ?? '#888' }}>{turn.agent_id.toUpperCase()}</span>
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>:: {turn.represents}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: `${EMOTION_COLORS[turn.emotion] ?? '#888'}22`, color: EMOTION_COLORS[turn.emotion] ?? '#888' }}>{turn.emotion}</span>
                    </div>
                    <p className="text-xs leading-relaxed pl-2"
                      style={{ color: 'hsl(var(--foreground))', borderLeft: `2px solid ${STANCE_COLORS[turn.stance] ?? '#333'}` }}>{turn.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REPORT TAB */}
          {activeTab === 'report' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Topic', value: data.topic, color: 'hsl(var(--primary))' },
                    { label: 'Rounds', value: String(simulation.total_rounds), color: 'hsl(var(--foreground))' },
                    { label: 'Agents', value: String(agents.total_agents), color: 'hsl(var(--foreground))' },
                    { label: 'Turns', value: String(simulation.turns.length), color: 'hsl(var(--foreground))' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5 rounded-lg border"
                      style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
                      <span className="text-xs font-bold truncate max-w-[55%] text-right" style={{ color, fontFamily: 'var(--font-heading)' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-xl border flex flex-col items-center justify-center"
                  style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-2"
                    style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Conflict Score</p>
                  <ConflictGauge score={dynamicConflictScore} />
                  <p className="text-xs text-center mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Calculated from agent stance variance</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Agent Stances</p>
                  <DonutChart data={donutData} />
                </div>
                <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Emotion Breakdown</p>
                  <HBarChart data={emotionBar} />
                </div>
              </div>

              {rounds.length > 1 && (
                <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Stance Shift by Round</p>
                  <div className="flex gap-4 items-end h-28">
                    {rounds.map((r) => {
                      const rd = roundMap[r];
                      const rt = (rd.pro + rd.con + rd.neutral) || 1;
                      return (
                        <div key={r} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex flex-col-reverse rounded overflow-hidden" style={{ height: '80px' }}>
                            {[{ key: 'pro', color: '#00ff88' }, { key: 'neutral', color: '#888' }, { key: 'con', color: '#ff4444' }].map(({ key, color }) => {
                              const v = rd[key as keyof typeof rd] ?? 0;
                              return v > 0 ? <div key={key} style={{ height: `${(v / rt) * 100}%`, background: color, opacity: 0.85 }} /> : null;
                            })}
                          </div>
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>R{r}</span>
                        </div>
                      );
                    })}
                    <div className="flex flex-col gap-1 ml-2">
                      {[{ c: '#00ff88', l: 'Pro' }, { c: '#888', l: 'Neutral' }, { c: '#ff4444', l: 'Con' }].map(({ c, l }) => (
                        <div key={l} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm" style={{ background: c }} />
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.9fr_1.2fr] gap-4">
                <div className="p-5 rounded-xl border flex flex-col gap-4" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Dominant Outcome</p>
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--primary) / 0.2)', color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>
                      visual summary
                    </span>
                  </div>
                  <p className="text-lg font-bold leading-snug" style={{ color: 'hsl(var(--foreground))', fontFamily: 'var(--font-heading)' }}>
                    {visualSummary[0].title}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {clampText(report.executive_summary, 180)}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                      {simulation.total_rounds} rounds
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                      {simulation.total_turns} turns
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                      {report.consensus_areas.length} consensus signals
                    </span>
                  </div>
                </div>

                <div className="p-5 rounded-xl border flex flex-col items-center justify-center text-center gap-4" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Conflict</p>
                  <div className="w-full flex justify-center">
                    <ConflictGauge score={dynamicConflictScore} />
                  </div>
                  <div className="w-full max-w-[240px]">
                    <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'hsl(var(--border))' }}>
                      <div className="h-full rounded-full" style={{ width: `${dynamicConflictScore * 100}%`, background: conflictMeta.color }} />
                    </div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {conflictMeta.label} conflict · {conflictMeta.band}
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-xl border flex flex-col gap-4" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Compromise Path</p>
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--primary) / 0.2)', color: '#00ff88', fontFamily: 'var(--font-heading)' }}>
                      likely landing zone
                    </span>
                  </div>
                  <div className="rounded-xl border p-4" style={{ background: 'hsl(var(--primary) / 0.05)', borderColor: 'hsl(var(--primary) / 0.12)' }}>
                    <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
                      {clampText(compromiseLead, 220)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {report.consensus_areas.slice(0, 3).map((area: string, index: number) => (
                      <div
                        key={index}
                        className="text-[11px] px-3 py-2 rounded-lg border leading-relaxed"
                        style={{
                          borderColor: 'hsl(var(--primary) / 0.18)',
                          background: 'hsl(var(--primary) / 0.08)',
                          color: 'hsl(var(--foreground))',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}
                      >
                        {clampText(area, 220)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Policy Decision Matrix</p>
                      <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Must do, conditional, and avoid buckets</p>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                      {report.policy_recommendations.length} recommendations
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {(['must', 'conditional', 'avoid'] as RecommendationBucket[]).map((bucket) => {
                      const meta = {
                        must: { label: 'Must do', color: '#00ff88', hint: 'Required actions' },
                        conditional: { label: 'Conditional', color: '#ffaa00', hint: 'Only under proof' },
                        avoid: { label: 'Avoid', color: '#ff4444', hint: 'Do not rely on this' },
                      }[bucket];
                      const items = recommendationBuckets[bucket];

                      return (
                        <div key={bucket} className="rounded-xl border p-3 flex flex-col gap-3 min-h-[260px]" style={{ borderColor: `${meta.color}33`, background: `${meta.color}0f` }}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold" style={{ color: meta.color, fontFamily: 'var(--font-heading)' }}>{meta.label}</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${meta.color}44`, color: meta.color }}>
                              {items.length}
                            </span>
                          </div>
                          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'hsl(var(--muted-foreground))' }}>{meta.hint}</p>
                          <div className="flex flex-col gap-2">
                            {items.length === 0 && (
                              <div className="rounded-lg border border-dashed p-3 text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                                No recommendations landed here.
                              </div>
                            )}
                            {items.map((item, index) => (
                              <div key={`${bucket}-${index}`} className="rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background) / 0.55)' }}>
                                <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--foreground))', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                  {clampText(item, 150)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Coalition Map</p>
                      <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Stakeholders grouped by final stance and influence</p>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                      {report.stakeholder_insights.length} groups
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {coalitionCards.map((bucket) => (
                      <div key={bucket.bucket} className="rounded-xl border p-3 min-h-[260px]" style={{ borderColor: `${bucket.color}33`, background: `${bucket.color}0b` }}>
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: bucket.color }} />
                            <p className="text-sm font-bold" style={{ color: bucket.color, fontFamily: 'var(--font-heading)' }}>{bucket.label}</p>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${bucket.color}44`, color: bucket.color }}>
                            {bucket.insights.length}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2">
                          {bucket.insights.length === 0 && (
                            <div className="rounded-lg border border-dashed p-3 text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                              No stakeholder insights in this coalition.
                            </div>
                          )}
                          {bucket.insights.map((insight) => {
                            const label = graphNodeLabelById[insight.represents] ?? insight.represents;
                            return (
                              <div key={`${bucket.bucket}-${insight.represents}`} className="rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background) / 0.55)' }}>
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div>
                                    <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{label}</p>
                                    <p className="text-[10px] uppercase tracking-widest" style={{ color: 'hsl(var(--muted-foreground))' }}>{insight.final_stance}</p>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${bucket.color}22`, color: bucket.color }}>
                                    {(insight.influence_score * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'hsl(var(--border))' }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.max(6, insight.influence_score * 100)}%`, background: bucket.color }} />
                                </div>
                                <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--foreground))', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                  {clampText(insight.summary, 120)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center justify-between mb-4 gap-3">
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Evidence Cards</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Short findings with named agents and highlighted quote chips</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                    {evidenceCards.length} findings
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  {evidenceCards.map((card) => (
                    <article key={card.id} className="rounded-xl border p-4" style={{ borderColor: `${card.accent}33`, background: `${card.accent}08` }}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: card.accent, fontFamily: 'var(--font-heading)' }}>{card.label}</p>
                          <p className="text-sm font-bold leading-snug mt-1" style={{ color: 'hsl(var(--foreground))', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {card.title}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 max-w-[180px]">
                          {card.names.length > 0 ? card.names.map((name) => (
                            <span
                              key={name}
                              className="text-[10px] px-2 py-1 rounded-md border leading-snug text-right"
                              style={{ borderColor: `${card.accent}44`, color: card.accent, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            >
                              {name}
                            </span>
                          )) : (
                            <span className="text-[10px] px-2 py-1 rounded-md border leading-snug" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                              No agent match
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border-l-2 p-3 mb-3" style={{ borderColor: card.accent, background: `${card.accent}12` }}>
                        <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: card.accent, fontFamily: 'var(--font-heading)' }}>Quote chip</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                          {clampText(card.quote, 180)}
                        </p>
                      </div>

                      <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {clampText(card.text, 220)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-xl border" style={{ background: 'hsl(var(--primary) / 0.04)', borderColor: 'hsl(var(--primary) / 0.18)' }}>
                <div className="flex items-center justify-between mb-4 gap-3">
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Scenario Ladder</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>A visual read of how the simulated policy debate resolves over time</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--primary) / 0.2)', color: 'hsl(var(--primary))' }}>
                    forward view
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                  {scenarioLadder.map((step, index) => (
                    <div key={step.year} className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: `${step.color}40`, background: `${step.color}12` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: step.color, fontFamily: 'var(--font-heading)' }}>{step.year}</span>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: step.color }} />
                      </div>
                      <p className="text-sm font-bold leading-snug" style={{ color: 'hsl(var(--foreground))' }}>{step.title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>{step.note}</p>
                      {index < scenarioLadder.length - 1 && (
                        <div className="h-px w-full mt-1" style={{ background: `${step.color}44` }} />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background) / 0.65)' }}>
                  <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'hsl(var(--primary))', fontFamily: 'var(--font-heading)' }}>Predicted outcome text</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
                    {clampText(report.predicted_outcome, 260)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      </section>
    </>
  );
}