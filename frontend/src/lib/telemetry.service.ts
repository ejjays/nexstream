import { BACKEND_URL } from './config';

// telemetry service
export const reportTelemetry = async (event: string, data: any = {}, clientId: string) => {
  try {
    await fetch(`${BACKEND_URL}/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ event, data, clientId })
    });
  } catch (err) {
    // silent fail
  }
};
