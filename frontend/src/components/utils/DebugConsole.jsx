import { useEffect } from 'react';

const DebugConsole = () => {
  useEffect(() => {
    const handleTouchStart = (e) => {
      // Check for 3-finger tap
      if (e.touches.length === 3) {
        if (window.eruda) {
          // If already loaded, just toggle/show
          if (window.eruda._isInit) {
             window.eruda.show();
          }
        } else {
          // Dynamically load Eruda from CDN
          const script = document.createElement('script');
          script.src = '//cdn.jsdelivr.net/npm/eruda';
          script.onload = () => {
            if (window.eruda) {
              window.eruda.init();
              window.eruda.show();
              console.log('Eruda initialized via 3-finger tap!');
            }
          };
          document.body.appendChild(script);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

  return null; // This component renders nothing visually
};

export default DebugConsole;
