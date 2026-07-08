interface Env {
  UPLOADS: R2Bucket;
}

/*
* serves comment images from the R2 bucket (bound as UPLOADS) on our own Pages
* domain, dodging r2.dev's production rate limit. keys are immutable
* (comments/<uid>/<uuid>.webp) so we cache hard at the edge. namespace is locked
* to comments/*.webp so this can't be used to probe the rest of the bucket.
*/
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const parts = context.params.path;
  const key = Array.isArray(parts) ? parts.join('/') : parts;

  if (!key || !key.startsWith('comments/') || !key.endsWith('.webp')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await context.env.UPLOADS.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (!headers.has('content-type')) headers.set('content-type', 'image/webp');
  return new Response(object.body, { headers });
};
