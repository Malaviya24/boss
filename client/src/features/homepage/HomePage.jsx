import { useEffect, useMemo } from 'react';
import { NodeRenderer } from '../../components/content/NodeRenderer.jsx';
import { useHomepageContent } from '../../hooks/content/useHomepageContent.js';

const ROTATING_PHRASES = [
  'Fix Ank',
  'Kalyan Fix',
  'Milan Fix',
  'Fix open',
  'Fix close',
  'Fix jodi',
];

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
    const intervalId = window.setInterval(() => {
      const rotatingElement = document.getElementById('rotatingText');
      if (!rotatingElement) {
        return;
      }

      const currentIndex = Number(rotatingElement.dataset.index ?? '0');
      const nextIndex = (currentIndex + 1) % ROTATING_PHRASES.length;
      rotatingElement.textContent = ROTATING_PHRASES[nextIndex];
      rotatingElement.dataset.index = String(nextIndex);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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

    const refreshControl = target.closest('[data-refresh-button="true"]');
    if (!refreshControl) {
      return;
    }

    event.preventDefault();
    if (refreshControl.getAttribute('data-save-scroll') === 'true') {
      window.localStorage.setItem('scrollPosition', String(window.scrollY));
    }
    window.location.reload();
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
