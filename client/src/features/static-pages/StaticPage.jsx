import { useEffect } from 'react';

/**
 * Shared shell for legacy static pages (about, privacy, tos, charts, etc.).
 *
 * Each page imports its raw HTML body via Vite's `?raw` query suffix and hands
 * it to this component. The HTML still contains its own inline <style> blocks,
 * so the original page styling continues to work even though it lives inside
 * the React tree.
 */
export default function StaticPage({ title, html, className = 'static-page' }) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  // eslint-disable-next-line react/no-danger
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
