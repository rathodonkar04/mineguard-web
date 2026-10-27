import { useEffect } from 'react';
import { ROUTE_METADATA, generateBreadcrumbSchema } from '../data/seoData';

/**
 * SeoHead Component
 * Manages document head metadata reactively per active route without external heavy dependencies.
 */
export default function SeoHead({ activeTab = 'dashboard', customCrumb = null }) {
  const meta = ROUTE_METADATA[activeTab] || ROUTE_METADATA.dashboard;

  useEffect(() => {
    // 1. Update Document Title
    if (meta?.title) {
      document.title = meta.title;
    }

    // 2. Update Meta Description
    let descTag = document.querySelector('meta[name="description"]');
    if (!descTag) {
      descTag = document.createElement('meta');
      descTag.setAttribute('name', 'description');
      document.head.appendChild(descTag);
    }
    descTag.setAttribute('content', meta.description);

    // 3. Update Canonical Tag
    let canonicalTag = document.querySelector('link[rel="canonical"]');
    if (!canonicalTag) {
      canonicalTag = document.createElement('link');
      canonicalTag.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalTag);
    }
    canonicalTag.setAttribute('href', meta.canonical);

    // 4. Update OpenGraph Tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', meta.title);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', meta.description);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', meta.canonical);

    // 5. Update Twitter Tags
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', meta.title);

    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', meta.description);

    // 6. Inject / Update BreadcrumbList JSON-LD Schema
    const breadcrumbs = customCrumb 
      ? [...meta.breadcrumbs, customCrumb] 
      : meta.breadcrumbs;

    let breadcrumbScript = document.getElementById('schema-breadcrumb');
    if (!breadcrumbScript) {
      breadcrumbScript = document.createElement('script');
      breadcrumbScript.id = 'schema-breadcrumb';
      breadcrumbScript.type = 'application/ld+json';
      document.head.appendChild(breadcrumbScript);
    }
    breadcrumbScript.textContent = JSON.stringify(generateBreadcrumbSchema(breadcrumbs));

  }, [activeTab, meta, customCrumb]);

  return null;
}
