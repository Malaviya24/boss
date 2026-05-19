import { useEffect, useMemo } from 'react';
import { NodeRenderer } from '../../components/content/NodeRenderer.jsx';
import { useHomepageContent } from '../../hooks/content/useHomepageContent.js';

function StyleRefs({ styleUrls = [], styleBlocks = [] }) {
  return (
    <>
      {styleUrls.map((href, index) => (
        <link key={`home-style-url-${index}`} rel="stylesheet" href={href} />
      ))}
      {styleBlocks.map((cssText, index) => (
        <style key={`home-style-block-${index}`}>{cssText}</style>
      ))}
    </>
  );
}

export default function HomePage() {
  const { content, status, error, connectionStatus, refresh } = useHomepageContent();

  useEffect(() => {
    const savedScrollPosition = window.localStorage.getItem('scrollPosition');
    if (savedScrollPosition !== null) {
      window.scrollTo(0, Number.parseInt(savedScrollPosition, 10));
      window.localStorage.removeItem('scrollPosition');
    }
  }, []);

  useEffect(() => {
    if (!content?.title) {
      return;
    }
    document.title = content.title;
  }, [content?.title]);

  const resolveSectionNodes = useMemo(
    () => (sectionId) => content?.sections?.[sectionId] ?? [],
    [content?.sections],
  );

  const handleClickCapture = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    // Check for explicit data-refresh-button attribute
    const refreshControl = target.closest('[data-refresh-button="true"]');
    if (refreshControl) {
      event.preventDefault();
      if (refreshControl.getAttribute('data-save-scroll') === 'true') {
        window.localStorage.setItem('scrollPosition', String(window.scrollY));
      }
      window.location.reload();
      return;
    }

    // Also catch any element with "REFRESH" text or refresh-related class
    const clickedText = String(target.textContent ?? '').trim().toLowerCase();
    const clickedClass = String(target.className ?? '').toLowerCase();
    if (clickedText === 'refresh' || clickedClass.includes('refresh')) {
      event.preventDefault();
      window.localStorage.setItem('scrollPosition', String(window.scrollY));
      window.location.reload();
    }
  };

  if (status === 'loading') {
    return (
      <div className="clone-loading">
        <div className="clone-spinner" aria-hidden="true" />
        <div>Loading DPBOSS...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="clone-loading">
        <div>{error || 'Unable to load homepage content.'}</div>
        <div>{connectionStatus === 'error' ? 'Connection error.' : null}</div>
        <button type="button" className="clone-retry-btn" onClick={() => void refresh()}>
          Retry now
        </button>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="clone-loading">
        <div>No live homepage data available.</div>
        <button type="button" className="clone-retry-btn" onClick={() => void refresh()}>
          Retry now
        </button>
      </div>
    );
  }

  return (
    <div className="clone-app" onClickCapture={handleClickCapture}>
      <StyleRefs styleUrls={content.styleUrls} styleBlocks={content.styleBlocks} />
      <NodeRenderer nodes={content.layoutNodes} resolveSectionNodes={resolveSectionNodes} />
    </div>
  );
}
