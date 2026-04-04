import { useEffect, useMemo, useState } from 'react';
import { useSocket } from '../hooks/useSocket.js';
import { fetchHomepage } from '../services/api.js';

const realtimeMode = import.meta.env.VITE_REALTIME_MODE ?? 'poll';
const pollIntervalMs = Number.parseInt(import.meta.env.VITE_POLL_INTERVAL_MS ?? '5000', 10);
const ROTATING_PHRASES = [
  'Fix Ank',
  'Kalyan Fix',
  'Milan Fix',
  'Fix open',
  'Fix close',
  'Fix jodi',
];

export default function HomePage() {
  const [template, setTemplate] = useState(null);
  const [htmlBySectionId, setHtmlBySectionId] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('connecting');

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

    return () => window.clearInterval(intervalId);
  }, [template]);

  useEffect(() => {
    const savedScrollPosition = window.localStorage.getItem('scrollPosition');
    if (savedScrollPosition !== null) {
      window.scrollTo(0, Number.parseInt(savedScrollPosition, 10));
      window.localStorage.removeItem('scrollPosition');
    }
  }, []);

  async function loadHomepage({ preserveConnection = false } = {}) {
    const payload = await fetchHomepage();
    setTemplate(payload.template);
    setHtmlBySectionId(payload.htmlBySectionId ?? {});

    if (!preserveConnection) {
      setConnectionStatus(realtimeMode === 'socket' ? 'connected' : 'polling');
    }
  }

  useEffect(() => {
    let isMounted = true;
    let intervalId;

    loadHomepage().catch(() => {
      if (isMounted) {
        setConnectionStatus('error');
      }
    });

    if (realtimeMode !== 'socket') {
      intervalId = window.setInterval(() => {
        loadHomepage({ preserveConnection: true }).catch(() => {
          if (isMounted) {
            setConnectionStatus('error');
          }
        });
      }, pollIntervalMs);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useSocket({
    enabled: realtimeMode === 'socket',
    onStatus: setConnectionStatus,
    onHomepageUpdate: (payload) => {
      if (payload.htmlBySectionId) {
        setHtmlBySectionId(payload.htmlBySectionId);
      }
    },
  });

  const content = useMemo(() => {
    if (!template) {
      return null;
    }

    const nodes = [];
    template.fragments.forEach((fragment, index) => {
      if (fragment) {
        nodes.push(<HtmlFragment key={`fragment-${index}`} html={fragment} />);
      }

      const sectionId = template.sectionOrder[index];
      if (sectionId) {
        nodes.push(
          <HtmlFragment
            key={`section-${sectionId}`}
            html={
              htmlBySectionId[sectionId] ?? template.fallbackHtmlBySectionId?.[sectionId] ?? ''
            }
          />,
        );
      }
    });

    return nodes;
  }, [htmlBySectionId, template]);

  function handleClickCapture(event) {
    const refreshButton = event.target.closest('[data-refresh-button="true"]');
    if (!refreshButton) {
      return;
    }

    event.preventDefault();

    if (refreshButton.dataset.saveScroll === 'true') {
      window.localStorage.setItem('scrollPosition', String(window.scrollY));
    }

    window.location.reload();
  }

  if (!template) {
    return (
      <div className="clone-loading">
        {connectionStatus === 'error' ? 'Unable to load homepage.' : 'Loading DPBOSS...'}
      </div>
    );
  }

  return (
    <div className="clone-app" onClickCapture={handleClickCapture}>
      {content}
    </div>
  );
}

function HtmlFragment({ html }) {
  return <div className="html-fragment" dangerouslySetInnerHTML={{ __html: html }} />;
}
