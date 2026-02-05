import { useState } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import SupportedServices from './modals/SupportedServices';

const Header = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <header
        className='flex gap-2 items-center justify-center p-4 cursor-pointer hover:opacity-80 transition-opacity'
        onClick={() => setIsModalOpen(true)}
      >
        <motion.div 
          animate={{ rotate: isModalOpen ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className='bg-gray-800 p-1 rounded-full'
        >
          <Plus size={14} />
        </motion.div>
        <h1 className='text-sm font-medium tracking-tight uppercase opacity-70'>supported services</h1>
      </header>

      <SupportedServices
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default Header;
