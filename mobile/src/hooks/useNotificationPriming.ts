import { useState, useCallback, useEffect } from 'react';
import { getNotify, setNotify } from '../lib/settings';
import { enableNotifications } from '../lib/notify';

const APPEAR_DELAY_MS = 650;

/*
* shows the notification permission sheet once per fresh install, but only
*  once `enabled` (i.e. onboarding done) so it never competes with onboarding 
*/
export function useNotificationPriming(enabled: boolean) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void getNotify().then((already) => {
        if (!cancelled && !already) setVisible(true);
      });
    }, APPEAR_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);

  const allow = useCallback(async () => {
    setVisible(false);
    const granted = await enableNotifications();
    if (granted) await setNotify(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return { visible, allow, dismiss };
}
