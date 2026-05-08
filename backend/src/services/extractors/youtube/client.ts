import { Innertube, UniversalCache, Log } from 'youtubei.js';

let youtube: any = null;

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

  youtube.session.on('undici:error', () => {});
  youtube.session.on('undici:warning', () => {});

  return youtube;
}
