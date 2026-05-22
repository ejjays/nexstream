
import { useEffect } from "react";

interface SEOProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  image?: string;
  schema?: Record<string, unknown>;
}

const SEO = ({ title, description, canonicalUrl, image, schema }: SEOProps) => {
  useEffect(() => {
    const baseTitle = "NexStream";
    const finalTitle = title
      ? `${baseTitle} | ${title}`
      : `${baseTitle} | 4K Youtube & Spotify Converter`;
    
    document.title = finalTitle;

    const defaultDescription = "A simple tool for high-quality YouTube and Spotify media extraction. Supports 4K video and MP3 downloads from various social platforms.";
    const finalDescription = description || defaultDescription;

    const createdTags: (HTMLMetaElement | HTMLLinkElement)[] = [];

    const updateMetaTag = (property: string, content: string, attr = "name") => {
      let element = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attr, property);
        document.head.appendChild(element);
        createdTags.push(element);
      }
      element.setAttribute("content", content);
    };

    updateMetaTag("description", finalDescription);
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
      createdTags.push(canonical);
    }
    const fullUrl = canonicalUrl 
      ? `${window.location.origin}${canonicalUrl}` 
      : window.location.href;
    canonical.setAttribute("href", fullUrl);

    // inject JSON-LD
    let schemaScript = document.getElementById("page-schema") as HTMLScriptElement;
    if (schema) {
      if (!schemaScript) {
        schemaScript = document.createElement("script");
        schemaScript.id = "page-schema";
        schemaScript.type = "application/ld+json";
        document.head.appendChild(schemaScript);
      }
      schemaScript.innerHTML = JSON.stringify(schema);
    } else if (schemaScript) {
      schemaScript.remove();
    }

    return () => {
      // cleanup page-specific schema
      const script = document.getElementById("page-schema");
      if (script) script.remove();

      // cleanup created tags
      createdTags.forEach(tag => tag.remove());
    };
  }, [title, description, canonicalUrl, image, schema]);

  return null;
};

export default SEO;
