
import { useEffect } from "react";

interface SEOProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  image?: string;
}

const SEO = ({ title, description, canonicalUrl, image }: SEOProps) => {
  useEffect(() => {
    const baseTitle = "NexStream";
    const finalTitle = title
      ? `${baseTitle} | ${title}`
      : `${baseTitle} | 4K Youtube & Spotify Converter`;
    
    document.title = finalTitle;

    const defaultDescription = "Best Youtube converter and Spotify downloader. Support TikTok, Instagram, and Facebook. Download in 4K or MP3 high quality for free.";
    const finalDescription = description || defaultDescription;

    const updateMetaTag = (property: string, content: string, attr: string = "name") => {
      let element = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attr, property);
        document.head.appendChild(element);
      }
      element.setAttribute("content", content);
    };

    updateMetaTag("description", finalDescription);
    
    // update OG
    updateMetaTag("og:title", finalTitle, "property");
    updateMetaTag("og:description", finalDescription, "property");
    updateMetaTag("og:url", window.location.href, "property");
    if (image) updateMetaTag("og:image", image, "property");

    updateMetaTag("twitter:title", finalTitle, "property");
    updateMetaTag("twitter:description", finalDescription, "property");
    if (image) updateMetaTag("twitter:image", image, "property");

    // set canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    const fullUrl = canonicalUrl 
      ? `${window.location.origin}${canonicalUrl}` 
      : window.location.href;
    canonical.setAttribute("href", fullUrl);

  }, [title, description, canonicalUrl, image]);

  return null;
};

export default SEO;
