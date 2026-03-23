import React, { useState, useEffect } from 'react';
import { DEMO_SONGS } from './DemoSongsConfig.js';
import logoImg from '/logo.webp';
import {
  Loader2,
  Plus,
  Search,
  ChevronRight,
  Radio
} from 'lucide-react';
import Tuner from './Tuner.jsx';
import UploadSidebar from './UploadSidebar.jsx';
import EmptyLibraryState from './EmptyLibraryState.jsx';
import { SongItem, DemoSongItem } from './SongListItems.jsx';
import { RenameModal, DeleteModal } from './ProjectModals.jsx';
import NewProjectModal from './NewProjectModal.jsx';

const UploadScreen = ({
  isProcessing,
  stemMode,
  setStemMode,
  engineMode,
  setEngineMode,
  apiUrl,
  setApiUrl,
  getBackendUrl,
  handleUpload,
  history = [],
  onSelectHistory,
  onExportHistory,
  onDeleteHistory,
  onRenameHistory,
  onExit
}) => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTunerModal, setShowTunerModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, projectName: '' });
  const [renameModal, setRenameModal] = useState({ isOpen: false, id: null, currentName: '', newName: '' });

  const handleSelectDemo = async demo => {
    try {
      const res = await fetch(demo.chordsPath);
      const projectData = await res.json();

      onSelectHistory({
        id: demo.id,
        name: demo.name,
        isDemo: true,
        stems: demo.stems,
        chords: projectData.chords || [],
        beats: projectData.beats || [],
        tempo: projectData.tempo || 0
      });
    } catch (err) {
      console.error('Failed to load demo song metadata', err);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    if (menuOpenId !== null) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

  if (isProcessing) {
    return (
      <div className='fixed inset-0 bg-[#050505]/95 backdrop-blur-sm z-[150] flex flex-col items-center justify-center'>
        <Loader2 className='text-[#22d3ee] animate-spin mb-4' size={48} strokeWidth={2} />
        <p className='text-zinc-400 font-medium text-lg'>Separating Tracks...</p>
      </div>
    );
  }

  return (
    <div className='flex-1 flex w-full bg-black h-full absolute inset-0 z-[100] overflow-hidden text-white font-sans'>
      <UploadSidebar logoImg={logoImg} onExit={onExit} />

      <div className='flex-1 flex flex-col bg-black h-full overflow-hidden w-full max-w-full'>
        {/* Top Header */}
        <div className='p-4 sm:p-8 pb-4 shrink-0 flex flex-col gap-6 w-full max-w-full box-border'>
          <div className='flex items-center gap-4'>
            <button onClick={onExit} className='md:hidden text-zinc-400 hover:text-white p-1'>
              <ChevronRight className='rotate-180' size={24} />
            </button>
            <h1 className='text-2xl sm:text-3xl font-medium text-white tracking-tight'>Songs</h1>
          </div>

          <div className='flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full'>
            <div className='relative w-full sm:flex-1'>
              <Search className='absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500' size={20} />
              <input
                type='text'
                placeholder='Search your library'
                className='w-full bg-[#1a1a1a] text-white rounded-xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-1 focus:ring-zinc-600 placeholder:text-zinc-500 text-sm sm:text-base border border-transparent transition-colors box-border'
              />
            </div>

            <div className='flex items-center gap-3 w-full sm:w-auto shrink-0'>
              <button
                onClick={() => setShowUploadModal(true)}
                className='flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-[#22d3ee] px-5 sm:px-6 py-3.5 rounded-xl font-medium transition-colors text-sm sm:text-base border border-transparent whitespace-nowrap'
              >
                <Plus size={18} strokeWidth={2.5} />
                <span className='hidden sm:block'>Upload</span>
                <span className='sm:hidden'>Add</span>
              </button>

              <button
                onClick={() => setShowTunerModal(true)}
                className='flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] text-[#22d3ee] px-5 sm:px-6 py-3.5 rounded-xl font-medium transition-colors text-sm sm:text-base border border-transparent whitespace-nowrap'
              >
                <Radio size={18} strokeWidth={2.5} />
                <span>Tuner</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className='flex-1 overflow-y-auto px-4 sm:px-8 py-2 flex flex-col'>
          <div className='text-zinc-500 text-sm mb-4 font-medium shrink-0'>
            {history.length} {history.length === 1 ? 'Song' : 'Songs'}
          </div>

          {history.length === 0 && <EmptyLibraryState />}

          {history.length > 0 && (
            <div className='flex flex-col gap-1 mb-4'>
              {history.slice(0, visibleCount).map((item, idx) => (
                <SongItem
                  key={item.id || idx}
                  item={item}
                  idx={idx}
                  onSelect={onSelectHistory}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  onExport={onExportHistory}
                  onRename={item => setRenameModal({ isOpen: true, id: item.id, currentName: item.name, newName: item.name })}
                  onDelete={item => setDeleteModal({ isOpen: true, id: item.id, projectName: item.name })}
                />
              ))}

              {history.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount(prev => prev + 5)}
                  className='mt-4 py-3 w-full border border-[#1a1a1a] hover:bg-[#1a1a1a] rounded-xl text-zinc-400 hover:text-white font-medium transition-colors'
                >
                  Show More
                </button>
              )}
            </div>
          )}

          {/* Examples Section */}
          <div className='mt-2 border-t border-zinc-900/50'>
            <h3 className='text-sm font-bold text-zinc-500 tracking-widest mb-4 mt-4'>Try these Examples</h3>
            <div className='flex flex-col gap-1 mb-4'>
              {DEMO_SONGS.map(demo => (
                <DemoSongItem key={demo.id} demo={demo} onSelect={handleSelectDemo} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <RenameModal
        isOpen={renameModal.isOpen}
        newName={renameModal.newName}
        setNewName={val => setRenameModal(prev => ({ ...prev, newName: val }))}
        onCancel={() => setRenameModal({ isOpen: false, id: null, currentName: '', newName: '' })}
        onSave={() => {
          onRenameHistory(renameModal.id, renameModal.currentName, renameModal.newName);
          setRenameModal({ isOpen: false, id: null, currentName: '', newName: '' });
        }}
      />

      <DeleteModal
        isOpen={deleteModal.isOpen}
        projectName={deleteModal.projectName}
        onCancel={() => setDeleteModal({ isOpen: false, id: null, projectName: '' })}
        onDelete={() => {
          onDeleteHistory(deleteModal.id);
          setDeleteModal({ isOpen: false, id: null, projectName: '' });
        }}
      />

      <NewProjectModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        apiUrl={apiUrl}
        setApiUrl={setApiUrl}
        getBackendUrl={getBackendUrl}
        engineMode={engineMode}
        setEngineMode={setEngineMode}
        stemMode={stemMode}
        setStemMode={setStemMode}
        handleUpload={e => {
          setShowUploadModal(false);
          handleUpload(e);
        }}
      />

      {showTunerModal && <Tuner onClose={() => setShowTunerModal(false)} />}
    </div>
  );
};

export default UploadScreen;
