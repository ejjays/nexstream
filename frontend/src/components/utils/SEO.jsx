import { useEffect } from "react";

const SEO = ({ title, description, canonicalUrl }) => {
  useEffect(() => {
    const baseTitle = "NexStream";
    document.title = title
      ? `${baseTitle} | ${title}`
      : `${baseTitle} | 4K Youtube & Spotify Converter`;

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute(
      "content",
      description ||
        "Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free.",
    );

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    const fullUrl = canonicalUrl
      ? `https://ej-nexstream.vercel.app${canonicalUrl}`
      : window.location.href;
    canonical.setAttribute("href", fullUrl);
  }, [title, description, canonicalUrl]);

  return null;
};

export default SEO;
