
interface Metadata {
  title: string;
  description: string;
  image?: string;
}

const SITE_CONFIG = {
  name: "NexStream",
  defaultDescription: "Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free.",
  defaultImage: "/og-image.webp"
};

const PAGE_METADATA: Record<string, Metadata> = {
  "/tools/key-changer": {
    title: "Song Key Changer | Detect & Transpose Audio",
    description: "Free online song key changer. Detect the key of any song and transpose it to a different key without losing quality. Perfect for singers and musicians."
  },
  "/tools/remix-lab": {
    title: "Remix Lab | Stem Separation & Analysis",
    description: "Advanced audio isolation and chord analysis. Extract vocals, drums, and instruments with AI precision."
  },
  "/resources/story": {
    title: "Our Story | The NexStream Mission",
    description: "Born out of frustration with bloatware, NexStream ensures high-quality media extraction remains free, private, and accessible."
  },
  "/resources/architecture": {
    title: "Technical Architecture | Media Orchestration Core",
    description: "Deep dive into the NexStream engine. Learn how we handle 4K streams and high-fidelity audio conversion."
  }
};

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  
  const response = await context.next();
  
  // check path
  if (!PAGE_METADATA[path] || !response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }

  const metadata = PAGE_METADATA[path];
  const finalTitle = `${SITE_CONFIG.name} | ${metadata.title}`;
  const finalDescription = metadata.description;
  const finalImage = metadata.image || SITE_CONFIG.defaultImage;

  let html = await response.text();

  // meta inject
  html = html.replace(/<title>.*?<\/title>/, `<title>${finalTitle}</title>`);
  html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${finalDescription}" />`);
  html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${url.href}" />`);

  // update JSON-LD
  html = html.replace(/<script type="application\/ld\+json">.*?<\/script>/s, `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": finalTitle,
    "operatingSystem": "All",
    "applicationCategory": "MultimediaApplication",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "description": finalDescription
  })}</script>`);

  // update OG
  html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${finalTitle}" />`);
  html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${finalDescription}" />`);
  html = html.replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${url.href}" />`);
  html = html.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${finalImage}" />`);
  
  // update twitter
  html = html.replace(/<meta property="twitter:title" content=".*?" \/>/, `<meta property="twitter:title" content="${finalTitle}" />`);
  html = html.replace(/<meta property="twitter:description" content=".*?" \/>/, `<meta property="twitter:description" content="${finalDescription}" />`);
  html = html.replace(/<meta property="twitter:image" content=".*?" \/>/, `<meta property="twitter:image" content="${finalImage}" />`);

  return new Response(html, response);
};
