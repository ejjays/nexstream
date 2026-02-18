import { useState, lazy, Suspense } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const SupportedServices = lazy(() => import('./modals/SupportedServices'));

const Header = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className='header-wrapper w-full flex justify-center relative z-[60] shrink-0'>
        <style>{`
          .header-wrapper {
            /* DEFAULT: Mobile Portrait (Reduced for tight fit) */
            padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
            padding-bottom: 1rem;
            padding-left: env(safe-area-inset-left, 0px);
            padding-right: env(safe-area-inset-right, 0px);
          }

          /* TABLET OR LANDSCAPE: More aggressive clearance */
          @media (min-width: 768px) or (orientation: landscape) {
            .header-wrapper {
              padding-top: calc(1.5rem + env(safe-area-inset-top, 0px));
            }
          }
        `}</style>

        <motion.header
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className='flex gap-3 items-center justify-center px-3.5 py-1.5 cursor-pointer bg-white/5 backdrop-blur-md rounded-full border border-cyan-500/30 hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 group'
          onClick={() => setIsModalOpen(true)}
        >
          <motion.div
            animate={{ rotate: isModalOpen ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className='bg-cyan-500/20 p-1 rounded-full border border-cyan-400/30 group-hover:bg-cyan-500/30 transition-colors'
          >
            <Plus size={14} className='text-cyan-400' />
          </motion.div>
          <h1 className='text-xs font-medium tracking-wide text-cyan-50/90 group-hover:text-cyan-300 transition-colors'>
            supported services
          </h1>
        </motion.header>
      </div>

      <Suspense fallback={null}>
        <SupportedServices
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </Suspense>
    </>
  );
};

export default Header;