import { useState, useCallback, useEffect } from 'react';
import { getNotify, setNotify } from '../lib/settings';
import { enableNotifications } from '../lib/notify';

// shows the notification permission sheet once per fresh install
export function useNotificationPriming() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    getNotify().then((already) => {
      if (!already) setVisible(true);
    });
  }, []);

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
