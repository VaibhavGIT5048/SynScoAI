import { motion } from 'motion/react';
import { Settings, Cpu, LineChart, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';

const steps = [
  {
    icon: Settings,
    step: '01',
    title: 'Configure',
    description:
      'Define your simulation topic, provide contextual background, and set the number of rounds and agents. The more precise your input, the richer the simulation output.',
  },
  {
    icon: Cpu,
    step: '02',
    title: 'Simulate',
    description:
      'SynSoc AI deploys a diverse cast of AI agents — each with distinct roles, biases, and reasoning models. They interact, debate, and influence each other across multiple rounds.',
  },
  {
    icon: LineChart,
    step: '03',
    title: 'Analyze',
    description:
      'Review the simulation transcript, agent stance distributions, consensus scores, and a structured AI-generated report with actionable findings and divergence metrics.',
  },
];

const principles = [
  {
    title: 'Emergent Complexity',
    description:
      'No outcomes are pre-programmed. Agent interactions produce emergent behaviors that mirror real-world societal dynamics — consensus, polarization, and everything in between.',
  },
  {
    title: 'Role Diversity',
    description:
      'Agents represent economists, activists, policymakers, business leaders, and citizens. Diverse perspectives ensure simulations capture the full spectrum of societal response.',
  },
  {
    title: 'Transparent Reasoning',
    description:
      'Every agent statement is logged in the simulation transcript. You can trace exactly how consensus formed — or why it failed — at the individual agent level.',
  },
  {
    title: 'Iterative Refinement',
    description:
      'Run multiple simulations with different parameters to stress-test ideas. Compare outcomes across configurations to identify robust policy directions.',
  },
];

export default function AboutPage() {
  return (
    <>
      <title>About — SynSoc AI</title>
      <meta
        name="description"
        content="Learn about SynSoc AI — the multi-agent simulation platform for modeling societal dynamics and predicting outcomes."
      />

      <section className="relative overflow-hidden">
        <ThemeAnimatedBackground className="fixed inset-0" />

      <div className="relative z-10 container mx-auto px-4 py-16 max-w-3xl">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-16"
        >
          <span
            className="text-xs font-bold tracking-widest uppercase mb-3 block"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
          >
            About the Project
          </span>
          <h1
            className="text-3xl md:text-4xl font-bold mb-6"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
          >
            What is SynSoc AI?
          </h1>
          <div className="space-y-4">
            <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
              SynSoc AI is a multi-agent simulation platform designed to model complex societal
              dynamics. By deploying AI agents that represent diverse human roles and perspectives,
              SynSoc AI enables researchers, policymakers, and thinkers to explore how societies
              might respond to proposed changes — before those changes are implemented.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Traditional policy analysis relies on static models and historical data. SynSoc AI
              introduces a dynamic layer: agents that reason, argue, adapt, and form emergent
              consensus — or expose deep fractures — in response to any topic you define.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
              The mission is simple:{' '}
              <span style={{ color: 'hsl(var(--foreground))' }}>
                make the invisible visible.
              </span>{' '}
              Surface the second-order effects, the hidden coalitions, the unexpected resistances
              that only emerge when diverse perspectives collide.
            </p>
          </div>
        </motion.div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-16">
          <div className="flex-1 h-px" style={{ background: 'hsl(var(--border))' }} />
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
          >
            How It Works
          </span>
          <div className="flex-1 h-px" style={{ background: 'hsl(var(--border))' }} />
        </div>

        {/* Steps */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16 space-y-4"
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: 'easeOut' }}
              className="flex gap-5 p-5 rounded-lg border transition-all duration-200"
              style={{
                background: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(var(--primary) / 0.3)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(var(--border))';
              }}
            >
              <div className="shrink-0 flex flex-col items-center gap-2">
                <div
                  className="w-10 h-10 rounded-md flex items-center justify-center"
                  style={{ background: 'hsl(var(--primary) / 0.1)' }}
                >
                  <step.icon size={18} style={{ color: 'hsl(var(--primary))' }} />
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 min-h-[20px]" style={{ background: 'hsl(var(--border))' }} />
                )}
              </div>
              <div className="pt-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs font-bold"
                    style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
                  >
                    {step.step}
                  </span>
                  <h3
                    className="text-sm font-bold"
                    style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
                  >
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-16">
          <div className="flex-1 h-px" style={{ background: 'hsl(var(--border))' }} />
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
          >
            Design Principles
          </span>
          <div className="flex-1 h-px" style={{ background: 'hsl(var(--border))' }} />
        </div>

        {/* Principles */}
        <div className="grid sm:grid-cols-2 gap-4 mb-16">
          {principles.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: 'easeOut' }}
              className="p-5 rounded-lg border"
              style={{
                background: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <h4
                className="text-sm font-bold mb-2"
                style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
              >
                {p.title}
              </h4>
              <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {p.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="rounded-xl border p-8 text-center relative overflow-hidden"
          style={{
            background: 'hsl(var(--card))',
            borderColor: 'hsl(var(--primary) / 0.2)',
          }}
        >
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, hsl(var(--primary)) 0%, transparent 70%)',
            }}
          />
          <h3
            className="text-xl font-bold mb-3 relative z-10"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
          >
            Ready to simulate?
          </h3>
          <p
            className="text-sm mb-6 relative z-10"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Configure your first simulation and see society in motion.
          </p>
          <Link
            to="/simulate"
            className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-md font-bold text-sm transition-all duration-300 relative z-10"
            style={{
              fontFamily: 'var(--font-heading)',
              background: 'hsl(var(--primary))',
              color: '#0a0a0a',
              boxShadow: '0 0 20px hsl(var(--primary) / 0.3)',
            }}
          >
            Start Simulation
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
      </section>
    </>
  );
}
