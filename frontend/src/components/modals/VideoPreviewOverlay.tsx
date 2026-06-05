import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, VideoOff } from 'lucide-react';
import { useRemixStore } from '../../store/useRemixStore';
import { BACKEND_URL } from '../../lib/config';
import { useModalA11y } from '../../hooks/useModalA11y';
import { resolveStreamUrls } from '../../lib/previewStream';

interface VideoPreviewOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  pageUrl?: string;
  formatId?: string;
  title?: string;
  poster?: string;
}

type PreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; src: string }
  | { phase: 'unsupported' }
  | { phase: 'error' };

const PreviewMessage = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center gap-3 text-gray-300 px-6 text-center">
    <VideoOff className="text-gray-500" size={40} />
    <p className="text-sm font-medium">{text}</p>
  </div>
);

const VideoPreviewOverlay = ({
  isOpen,
  onClose,
  pageUrl,
  formatId,
  title,
  poster,
}: VideoPreviewOverlayProps) => {
  const backendUrl = useRemixStore((state) => state.backendUrl) || BACKEND_URL;
  const clientId = useRemixStore((state) => state.clientId);

  const [state, setState] = useState<PreviewState>({ phase: 'loading' });
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // free the proxy stream + concurrency lock
  const stopVideo = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, []);

  const handleClose = useCallback(() => {
    stopVideo();
    onClose();
  }, [stopVideo, onClose]);

  useModalA11y(isOpen, handleClose, panelRef);

  // resolve via shared cache
  useEffect(() => {
    if (!isOpen) return undefined;
    if (!pageUrl || !formatId) {
      setState({ phase: 'unsupported' });
      return undefined;
    }

    let active = true;
    setState({ phase: 'loading' });

    resolveStreamUrls(backendUrl, pageUrl, formatId, clientId)
      .then((data) => {
        if (!active) return;
        // separate audio means not single-playable
        if (data.videoUrl && !data.audioUrl) {
          setState({ phase: 'ready', src: data.videoUrl });
        } else {
          setState({ phase: 'unsupported' });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('[VideoPreview] resolve failed:', error);
        setState({ phase: 'error' });
      });

    return () => {
      active = false;
    };
  }, [isOpen, pageUrl, formatId, backendUrl, clientId]);

  // stop playback once the overlay is dismissed
  useEffect(() => {
    if (!isOpen) stopVideo();
  }, [isOpen, stopVideo]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title ? `Preview: ${title}` : 'Video preview'}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 flex items-center justify-center bg-black/95 backdrop-blur-sm outline-none"
          style={{ zIndex: 2147483647 }}
          onClick={handleClose}
        >
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(event) => {
              event.stopPropagation();
              handleClose();
            }}
            aria-label="Close preview"
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X size={24} />
          </motion.button>

          <div
            className="relative flex items-center justify-center w-full h-full p-4 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            {state.phase === 'loading' && (
              <Loader2 className="animate-spin text-cyan-400" size={40} />
            )}

            {state.phase === 'ready' && (
              <motion.video
                ref={videoRef}
                key={state.src}
                src={state.src}
                poster={poster}
                controls
                autoPlay
                playsInline
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="max-w-full max-h-full rounded-xl shadow-2xl bg-black"
              />
            )}

            {state.phase === 'unsupported' && (
              <PreviewMessage text="Inline preview isn't available for this source." />
            )}

            {state.phase === 'error' && (
              <PreviewMessage text="Couldn't load the preview. Please try again." />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};

export default VideoPreviewOverlay;
