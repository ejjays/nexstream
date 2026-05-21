
interface Metadata {
  title: string;
  description: string;
  image?: string;
}

const SITE_CONFIG = {
  name: "NexStream",
  defaultDescription: "A simple tool for high-quality YouTube and Spotify media extraction. Supports 4K video and MP3 downloads from various social platforms.",
  defaultImage: "/og-image.webp"
};

const PAGE_METADATA: Record<string, Metadata> = {
  "/tools/key-changer": {
    title: "Song Key Changer | Detect & Transpose Audio",
    description: "A utility to detect the key of a song and adjust its pitch or tempo without losing audio quality."
  },
  "/tools/remix-lab": {
    title: "Remix Lab | Stem Separation & Analysis",
    description: "Tools for isolating vocals, drums, and instruments from any track using AI-assisted processing."
  },
  "/resources/story": {
    title: "Our Story | The NexStream Mission",
    description: "The background of NexStream and our goal to provide clean, accessible media tools for everyone."
  },
  "/resources/architecture": {
    title: "Technical Architecture | Media Orchestration Core",
    description: "A look into how NexStream handles media processing and high-fidelity extraction."
  },
  "/resources/stack": {
    title: "Tech Stack | The Tools Behind the Magic",
    description: "A list of the technologies we use to build and maintain NexStream."
  },
  "/resources/audio-guide": {
    title: "Audio Guide | Mastering MP3 Extraction",
    description: "Tips on getting the best audio results when downloading music through NexStream."
  },
  "/resources/video-guide": {
    title: "Video Guide | 4K & HDR Downloads",
    description: "Information on how to save high-resolution videos while maintaining their original quality."
  },
  "/resources/security": {
    title: "Security & Privacy | Our Commitment",
    description: "How we protect your privacy by keeping the platform ad-free and tracking-free."
  },
  "/resources/remix-guide": {
    title: "Remix Guide | AI Audio Separation",
    description: "A quick walkthrough on using our AI tools to isolate individual tracks for your projects."
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

  // update meta
  html = html.replace(/<title>.*?<\/title>/i, `<title>${finalTitle}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${finalDescription}" />`);
  html = html.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${url.href}" />`);

  // update JSON-LD
  html = html.replace(/<script\s+type="application\/ld\+json"(?:\s+id=".*?")?.*?>.*?<\/script>/s, `<script type="application/ld+json" id="global-schema">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "NexStream",
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
  html = html.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/gi, `<meta property="og:title" content="${finalTitle}" />`);
  html = html.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/gi, `<meta property="og:description" content="${finalDescription}" />`);
  html = html.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/gi, `<meta property="og:url" content="${url.href}" />`);
  html = html.replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/gi, `<meta property="og:image" content="${finalImage}" />`);
  
  // update twitter
  html = html.replace(/<meta\s+property="twitter:title"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:title" content="${finalTitle}" />`);
  html = html.replace(/<meta\s+property="twitter:description"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:description" content="${finalDescription}" />`);
  html = html.replace(/<meta\s+property="twitter:image"\s+content=".*?"\s*\/?>/gi, `<meta property="twitter:image" content="${finalImage}" />`);

  return new Response(html, response);
};
