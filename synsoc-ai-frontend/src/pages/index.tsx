import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Brain, Network, BarChart3 } from 'lucide-react';
import ThemeAnimatedBackground from '@/components/ThemeAnimatedBackground';

const MotionLink = motion(Link);

// Typing cursor animation for headline
function TypingHeadline() {
  const fullText = 'SynSoc AI — Simulate Society. Predict Outcomes.';
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (idx.current < fullText.length) {
        setDisplayed(fullText.slice(0, idx.current + 1));
        idx.current++;
      } else {
        setDone(true);
        clearInterval(timer);
      }
    }, 35);
    return () => clearInterval(timer);
  }, []);

  return (
    <h1
      className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight"
      style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
    >
      {displayed}
      {!done && (
        <span
          className="inline-block w-0.5 h-[1em] ml-1 align-middle animate-pulse"
          style={{ background: 'hsl(var(--primary))' }}
        />
      )}
    </h1>
  );
}

const features = [
  {
    icon: Brain,
    title: 'Multi-Agent Simulation',
    description:
      'Deploy dozens of AI agents representing diverse societal roles — economists, activists, policymakers, citizens — each with unique perspectives and decision-making models.',
  },
  {
    icon: Network,
    title: 'Dynamic Interaction Rounds',
    description:
      'Watch agents debate, negotiate, and influence each other across configurable simulation rounds. Emergent behaviors surface naturally from complex interactions.',
  },
  {
    icon: BarChart3,
    title: 'Outcome Analytics',
    description:
      'Get structured reports, consensus graphs, and divergence metrics. Understand not just what happened, but why — and what it means for the real world.',
  },
];

export default function HomePage() {
  return (
    <>
      <title>SynSoc AI — Simulate Society. Predict Outcomes.</title>
      <meta
        name="description"
        content="SynSoc AI uses multi-agent simulation to model societal dynamics and predict outcomes for complex topics."
      />

      <div className="relative overflow-hidden">
        <ThemeAnimatedBackground className="fixed inset-0" />

      {/* Hero */}
      <section className="relative z-10 min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden">

        <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="mb-4"
          >
            <span
              className="inline-block text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full border mb-6"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'hsl(var(--primary))',
                borderColor: 'hsl(var(--primary) / 0.3)',
                background: 'hsl(var(--primary) / 0.05)',
              }}
            >
              AI-Powered Society Simulation
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="mb-6"
          >
            <TypingHeadline />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.8, ease: 'easeOut' }}
            className="text-base md:text-lg mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Configure a topic, deploy intelligent agents, and watch society unfold. SynSoc AI
            models complex human dynamics to surface insights no single perspective can see.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 2.1, ease: 'easeOut' }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <MotionLink
              to="/simulate"
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="group inline-flex items-center gap-2 px-8 py-3 rounded-md font-bold text-sm"
              style={{
                fontFamily: 'var(--font-heading)',
                background: 'hsl(var(--primary))',
                color: '#0a0a0a',
                boxShadow: '0 0 20px hsl(var(--primary) / 0.3)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                  '0 0 40px hsl(var(--primary) / 0.6)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                  '0 0 20px hsl(var(--primary) / 0.3)';
              }}
            >
              Start Simulation
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </MotionLink>
            <MotionLink
              to="/about"
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-md font-bold text-sm border"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'hsl(var(--muted-foreground))',
                borderColor: 'hsl(var(--border))',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(var(--primary) / 0.5)';
                (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(var(--foreground))';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'hsl(var(--border))';
                (e.currentTarget as HTMLAnchorElement).style.color = 'hsl(var(--muted-foreground))';
              }}
            >
              Learn More
            </MotionLink>
          </motion.div>

        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0a)' }}
        />
      </section>

      {/* Features */}
      <section className="relative z-10 py-24 container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-16"
        >
          <h2
            className="text-2xl md:text-3xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
          >
            How It Works
          </h2>
          <div
            className="w-16 h-px mx-auto"
            style={{ background: 'hsl(var(--primary))' }}
          />
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15, ease: 'easeOut' }}
              className="group relative p-6 rounded-lg border transition-all duration-300 cursor-default"
              style={{
                background: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(var(--primary) / 0.4)';
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  '0 0 20px hsl(var(--primary) / 0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'hsl(var(--border))';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center mb-4"
                style={{ background: 'hsl(var(--primary) / 0.1)' }}
              >
                <feature.icon size={20} style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <h3
                className="text-base font-bold mb-2"
                style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
              >
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative z-10 py-16 container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative rounded-xl border p-12 text-center overflow-hidden"
          style={{
            background: 'hsl(var(--card))',
            borderColor: 'hsl(var(--primary) / 0.2)',
          }}
        >
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, hsl(var(--primary)) 0%, transparent 70%)',
            }}
          />
          <h2
            className="text-2xl md:text-3xl font-bold mb-4 relative z-10"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--foreground))' }}
          >
            Ready to run your first simulation?
          </h2>
          <p
            className="text-sm mb-8 relative z-10"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Configure agents, set the stage, and let the simulation begin.
          </p>
          <MotionLink
            to="/simulate"
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="group inline-flex items-center gap-2 px-8 py-3 rounded-md font-bold text-sm relative z-10"
            style={{
              fontFamily: 'var(--font-heading)',
              background: 'hsl(var(--primary))',
              color: '#0a0a0a',
              boxShadow: '0 0 20px hsl(var(--primary) / 0.3)',
            }}
          >
            Configure Simulation
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </MotionLink>
        </motion.div>
      </section>
      </div>
    </>
  );
}
