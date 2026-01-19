import { useState } from 'react';
import { Plus, FlaskConical, Download } from 'lucide-react';
import SupportedServices from './modals/SupportedServices';

const Header = ({ mode, setMode }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <header className='flex items-center justify-between p-4 px-6'>
        <div
          className='flex gap-2 items-center cursor-pointer hover:opacity-80 transition-opacity'
          onClick={() => setIsModalOpen(true)}
        >
          <div className='bg-gray-800 p-1 rounded-full'>
            <Plus size={14} />
          </div>
          <h1 className='text-sm font-medium opacity-70'>supported services</h1>
        </div>

        <button
          onClick={() => setMode(mode === 'download' ? 'remix' : 'download')}
          className='flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/40 transition-all active:scale-95'
        >
          {mode === 'download' ? (
            <>
              <FlaskConical size={14} className='text-purple-400' />
              <span className='text-xs font-bold text-purple-200 uppercase tracking-widest'>Remix Lab</span>
            </>
          ) : (
            <>
              <Download size={14} className='text-blue-400' />
              <span className='text-xs font-bold text-blue-200 uppercase tracking-widest'>Downloader</span>
            </>
          )}
        </button>
      </header>

      <SupportedServices
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default Header;
