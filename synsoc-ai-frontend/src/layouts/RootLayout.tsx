import { type ReactElement } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';

import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';

/**
 * Root layout component that wraps all pages with consistent header and footer
 *
 * This component provides a centralized layout structure for the entire application,
 * ensuring consistent navigation and footer across all pages. It uses the Website
 * layout component and includes Header and Footer components.
 *
 * To customize the header or footer, directly edit the Header.tsx and Footer.tsx files
 * in the layouts/parts directory.
 *
 * @param children - Child routes to render (typically <Outlet /> from react-router-dom)
 *
 * @example
 * ```tsx
 * <RootLayout>
 *   <Outlet />
 * </RootLayout>
 * ```
 */
interface RootLayoutProps {
  children: ReactElement;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();

  return (
    <Website>
      <Header />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          className="flex-1"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <Footer />
    </Website>
  );
}
