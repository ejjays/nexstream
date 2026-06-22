import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

/* ignores keyboard window-resize; updates on rotation */
export function useScreenSize() {
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims((prev) => (prev.width === window.width ? prev : window));
    });
    return () => sub.remove();
  }, []);
  return dims;
}
