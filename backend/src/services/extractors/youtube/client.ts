import { Innertube, UniversalCache, Log } from 'youtubei.js';

let youtube: Innertube | null = null;

interface LogType {
  setLevel: (level: number) => void;
  Level: { NONE: number };
}

interface InnertubeShim {
  Platform: {
    shim: {
      eval: (data: string, env: Record<string, unknown>) => string;
    }
  }
}

export async function getYoutubeClient() {
  if (youtube) return youtube;

  (Log as unknown as LogType).setLevel((Log as unknown as LogType).Level.NONE);

  const platform = (Innertube as unknown as InnertubeShim).Platform;
  if (platform && platform.shim) {
    platform.shim.eval = (data: string) => {
      return data;
    };
  }

  youtube = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true
  });

  return youtube;
}
