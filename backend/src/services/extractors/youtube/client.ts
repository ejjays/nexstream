import { Innertube, UniversalCache, Log } from 'youtubei.js';

let youtube: Innertube | null = null;

export async function getYoutubeClient() {
  if (youtube) return youtube;

  (Log as any).setLevel((Log as any).Level.NONE);

  (Innertube as any).Platform.shim.eval = (data: any, env: any) => {
    return data;
  };

  youtube = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true
  });

  return youtube;
}
