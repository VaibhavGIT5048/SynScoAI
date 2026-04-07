import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

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
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link
            to="/"
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: 'var(--font-heading)', color: 'hsl(var(--primary))' }}
          >
            SynSoc<span className="text-foreground"> AI</span>
          </Link>

          <nav className="hidden md:flex gap-8">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
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
                </Link>
              );
            })}
          </nav>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-md transition-colors hover:text-primary"
            style={{ color: 'hsl(var(--muted-foreground))' }}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border py-4">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
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
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
