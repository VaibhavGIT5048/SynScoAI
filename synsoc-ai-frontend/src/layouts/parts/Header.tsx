import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';

const MotionLink = motion(Link);

export default function Header() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/simulate', label: 'Simulate' },
    { href: '/results', label: 'Results' },
    { href: '/about', label: 'About' },
  ];

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border"
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <MotionLink
            to="/"
            className="text-xl font-bold tracking-tight"
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
          >
            SynSoc<span className="text-foreground"> AI</span>
          </MotionLink>

          <nav className="hidden md:flex gap-8">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <MotionLink
                  key={item.href}
                  to={item.href}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative text-sm font-medium transition-colors pb-1 group"
                  style={{
                    fontFamily: 'var(--font-heading)',
                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {item.label}
                  <span
                    className="absolute bottom-0 left-0 h-px transition-all duration-300"
                    style={{
                      width: isActive ? '100%' : '0%',
                      background: 'hsl(var(--primary))',
                    }}
                  />
                  <span
                    className="absolute bottom-0 left-0 h-px transition-all duration-300 opacity-0 group-hover:opacity-100 group-hover:w-full"
                    style={{
                      width: '0%',
                      background: 'hsl(var(--primary))',
                    }}
                  />
                </MotionLink>
              );
            })}
          </nav>

          <motion.button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            className="md:hidden p-2 rounded-md transition-colors hover:text-primary"
            style={{ color: 'hsl(var(--muted-foreground))' }}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </motion.button>
        </div>

        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="md:hidden border-t border-border py-4"
          >
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <MotionLink
                    key={item.href}
                    to={item.href}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className="text-sm font-medium py-3 px-2 rounded transition-colors border-l-2"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      borderColor: isActive ? 'hsl(var(--primary))' : 'transparent',
                      background: isActive ? 'hsl(var(--primary) / 0.05)' : 'transparent',
                    }}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </MotionLink>
                );
              })}
            </nav>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}
