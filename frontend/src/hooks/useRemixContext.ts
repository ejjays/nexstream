import { useContext } from 'react';
import {
  RemixContext,
  RemixContextType,
} from '../context/RemixContextInstance';

export const useRemixContext = (): RemixContextType => {
  const context = useContext(RemixContext);
  if (!context)
    throw new Error('useRemixContext must be used within RemixProvider');
  return context;
};
