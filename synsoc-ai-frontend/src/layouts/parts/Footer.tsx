import { motion } from 'motion/react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <motion.footer
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mt-auto border-t border-border bg-background"
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <span
            className="text-xs"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--muted-foreground))' }}
          >
            © {currentYear}{' '}
            <span style={{ color: 'hsl(var(--primary))' }}>SynSoc AI</span>
            {' '}— All rights reserved.
          </span>
          <span
            className="text-xs"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--muted-foreground))' }}
          >
            v0.1.0-beta
          </span>
        </div>
      </div>
    </motion.footer>
  );
}
