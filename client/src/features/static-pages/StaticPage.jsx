import { useEffect, useMemo, useRef } from 'react';

/**
 * Shared shell for legacy static pages (about, privacy, tos, charts, etc.).
 *
 * Each page imports its raw HTML body via Vite's `?raw` query suffix and hands
 * it to this component. The HTML still contains its own inline <style> blocks,
 * so the original page styling continues to work even though it lives inside
 * the React tree.
 */

function rebrandHtml(rawHtml = '') {
  if (typeof rawHtml !== 'string') return '';
  return rawHtml
    // Replace the embedded base64 source-site banner with our brand banner
    .replace(
      /<img[^>]+src="data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAhsAAABpCAMAAACkjBFs[^"]+"[^>]*>/gi,
      '<img src="/banner.png" alt="MATKAKING" style="max-height:140px;height:auto;width:auto;max-width:100%;display:block;margin:auto;">'
    )
    // Number replacement
    .replace(/88781750XX/g, '86199201XX')
    // Email replacements
    .replace(/support@matkaking\.(?:net|boston)/gi, 'support@matkaking.cc')
    .replace(/support@matkakingresultapi\.com/gi, 'support@matkaking.cc')
    .replace(/support@dpbossss?\.(?:net|boston|com)/gi, 'support@matkaking.cc')
    // Domain replacements
    .replace(/DPBOSSSS\.BOSTON/gi, 'MATKAKING.CC')
    .replace(/DPBOSS\.BOSTON/gi, 'MATKAKING.CC')
    .replace(/dpbossss\.boston/gi, 'matkaking.cc')
    .replace(/dpboss\.boston/gi, 'matkaking.cc')
    .replace(/matkakingplay\.live\/download-app\.php/gi, 'matkaking.bet')
    .replace(/matkakingplay\.live/gi, 'matkaking.bet')
    // Brand name replacements
    .replace(/DPBOSSSS/g, 'MATKAKING')
    .replace(/DPBOSS/g, 'MATKAKING')
    .replace(/DpBossss/g, 'MatkaKing')
    .replace(/DpBoss/g, 'MatkaKing')
    .replace(/DPBossss/g, 'MatkaKing')
    .replace(/DPBoss/g, 'MatkaKing')
    .replace(/Dpbossss/g, 'MatkaKing')
    .replace(/Dpboss/g, 'MatkaKing')
    .replace(/dpbossss/g, 'matkaking')
    .replace(/dpboss/g, 'matkaking')
    // Standalone word replacements
    .replace(/\bBOSTON\b/g, 'CC')
    .replace(/\bBoston\b/g, 'Cc')
    .replace(/\bboston\b/g, 'cc')
    .replace(/\bBOSS\b/g, 'KING')
    .replace(/\bBoss\b/g, 'King')
    .replace(/\bboss\b/g, 'king')
    .replace(/\bDP\b/g, 'MATKA')
    .replace(/\bDp\b/g, 'Matka')
    .replace(/\bdp\b/g, 'matka');
}

export default function StaticPage({ title, html, className = 'static-page' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  const rebranded = useMemo(() => rebrandHtml(html), [html]);

  useEffect(() => {
    if (!containerRef.current) return;
    // Execute any <script> tags injected via dangerouslySetInnerHTML
    const scripts = containerRef.current.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      Array.from(oldScript.attributes).forEach((attr) => {
        if (attr.name !== 'src') {
          newScript.setAttribute(attr.name, attr.value);
        }
      });
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [rebranded]);

  return (
    <div
      ref={containerRef}
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: rebranded }}
    />
  );
}
