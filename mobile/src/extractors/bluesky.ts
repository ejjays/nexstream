import { VideoInfo, Format } from './types';
import { normalizeTitle, normalizeArtist } from './social';
import { gatedFetch } from '../lib/net';

const APPVIEW = 'https://public.api.bsky.app/xrpc';

interface BlobRef {
  ref?: { $link?: string };
  size?: number;
}
interface AspectRatio {
  width?: number;
  height?: number;
}
interface BskyEmbed {
  video?: BlobRef;
  aspectRatio?: AspectRatio;
  media?: { video?: BlobRef; aspectRatio?: AspectRatio };
  record?: { uri?: string; record?: { uri?: string } };
}
interface BskyView {
  thumbnail?: string;
  aspectRatio?: AspectRatio;
  media?: { thumbnail?: string; aspectRatio?: AspectRatio };
}
interface BskyPost {
  record?: { text?: string; embed?: BskyEmbed };
  embed?: BskyView;
  author?: { displayName?: string; handle?: string };
}
interface VideoData {
  cid: string;
  size?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await gatedFetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// resolve the user's PDS from their DID
async function resolvePds(did: string): Promise<string | null> {
  let docUrl: string | null = null;
  if (did.startsWith('did:plc:')) docUrl = `https://plc.directory/${did}`;
  else if (did.startsWith('did:web:'))
    docUrl = `https://${did.slice(8).replace(/:/gu, '/')}/.well-known/did.json`;
  if (!docUrl) return null;

  const doc = await fetchJson<{
    service?: { type?: string; serviceEndpoint?: string }[];
  }>(docUrl);
  const svc = (doc?.service || []).find(
    (entry) => entry.type === 'AtprotoPersonalDataServer'
  );
  return svc?.serviceEndpoint ?? null;
}

function pickVideo(post: BskyPost | undefined): VideoData | null {
  const embed = post?.record?.embed;
  const blob = embed?.video ?? embed?.media?.video;
  const cid = blob?.ref?.$link;
  if (!cid) return null;

  const aspect =
    embed?.aspectRatio ??
    embed?.media?.aspectRatio ??
    post?.embed?.aspectRatio ??
    post?.embed?.media?.aspectRatio;
  return {
    cid,
    size: blob?.size,
    width: aspect?.width,
    height: aspect?.height,
    thumbnail: post?.embed?.thumbnail ?? post?.embed?.media?.thumbnail,
  };
}

function buildFormat(blobUrl: string, video: VideoData): Format {
  const { width, height } = video;
  const short = width && height ? Math.min(width, height) : undefined;
  return {
    formatId: short ? `${short}p` : 'source',
    url: blobUrl,
    extension: 'mp4',
    width,
    height,
    resolution: width && height ? `${width}x${height}` : undefined,
    quality: short ? `${short}p` : 'Source',
    vcodec: 'h264',
    acodec: 'aac',
    filesize: typeof video.size === 'number' ? video.size : undefined,
    isMuxed: true,
    isVideo: true,
    isAudio: false,
  };
}

// at:// uri of a quoted post (quote-posts hold the video in the quote)
function quotedPostUri(post: BskyPost | undefined): string | undefined {
  const rec = post?.record?.embed?.record;
  return rec?.uri ?? rec?.record?.uri;
}

export async function getInfo(url: string): Promise<VideoInfo | null> {
  try {
    const match = url.match(/profile\/([^/]+)\/post\/([^/?#]+)/u);
    if (!match) return null;
    const [, handle, rkey] = match;

    const resolved = await fetchJson<{ did?: string }>(
      `${APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    const did = resolved?.did;
    if (!did) return null;

    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const thread = await fetchJson<{ thread?: { post?: BskyPost } }>(
      `${APPVIEW}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}`
    );
    const post = thread?.thread?.post;

    // direct video, else follow the quoted post (the video lives in the quote)
    let video = pickVideo(post);
    let videoDid = did;
    let videoPost = post;
    if (!video) {
      const quoted = quotedPostUri(post);
      const qMatch = quoted?.match(
        /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/u
      );
      if (qMatch) {
        const [, qDid, qRkey] = qMatch;
        const qThread = await fetchJson<{ thread?: { post?: BskyPost } }>(
          `${APPVIEW}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
            `at://${qDid}/app.bsky.feed.post/${qRkey}`
          )}`
        );
        const qPost = qThread?.thread?.post;
        const qVideo = pickVideo(qPost);
        if (qVideo) {
          video = qVideo;
          videoDid = qDid;
          videoPost = qPost;
        }
      }
    }
    if (!video) return null;

    const pds = await resolvePds(videoDid);
    if (!pds) return null;
    const blobUrl = `${pds}/xrpc/com.atproto.sync.getBlob?did=${videoDid}&cid=${video.cid}`;

    const info: VideoInfo = {
      type: 'video',
      id: rkey,
      title: post?.record?.text || videoPost?.record?.text || 'Bluesky Video',
      uploader:
        post?.author?.displayName || post?.author?.handle || 'Bluesky User',
      webpageUrl: url,
      thumbnail: video.thumbnail,
      formats: [buildFormat(blobUrl, video)],
      extractorKey: 'bluesky',
      isJsInfo: true,
      fromBrain: false,
      isPartial: false,
      isIsrcMatch: false,
      isFullData: true,
    };

    info.title = normalizeTitle(info);
    info.uploader = normalizeArtist(info);

    return info;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[JS-Bluesky] Error extracting ${url}: ${message}`);
    return null;
  }
}
