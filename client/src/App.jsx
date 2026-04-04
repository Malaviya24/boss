import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const realtimeMode = import.meta.env.VITE_REALTIME_MODE ?? 'socket';
const pollIntervalMs = Number.parseInt(
  import.meta.env.VITE_POLL_INTERVAL_MS ?? '5000',
  10,
);
const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim() || undefined;
const socket =
  realtimeMode === 'socket'
    ? io(socketUrl ?? '/', {
        autoConnect: false,
        transports: ['websocket', 'polling'],
      })
    : null;

const ROTATING_PHRASES = [
  'Fix Ank',
  'Kalyan Fix',
  'Milan Fix',
  'Fix open',
  'Fix close',
  'Fix jodi',
];

export default function App() {
  const [template, setTemplate] = useState(null);
  const [htmlBySectionId, setHtmlBySectionId] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    let isMounted = true;
    let intervalId;

    async function loadHomepage() {
      const response = await fetch('/api/homepage', {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Homepage request failed');
      }

      const payload = await response.json();

      if (!isMounted) {
        return;
      }

      setTemplate(payload.template);
      setHtmlBySectionId(payload.htmlBySectionId ?? {});
      setConnectionStatus('connected');
    }

    loadHomepage().catch(() => {
      if (isMounted) {
        setConnectionStatus('error');
      }
    });

    if (realtimeMode === 'socket' && socket) {
      socket.connect();

      socket.on('connect', () => {
        setConnectionStatus('connected');
      });

      socket.on('disconnect', () => {
        setConnectionStatus('disconnected');
      });

      socket.on('homepage-update', (payload) => {
        setHtmlBySectionId(payload.htmlBySectionId ?? {});
      });
    } else {
      setConnectionStatus('polling');
      intervalId = window.setInterval(() => {
        loadHomepage().catch(() => {
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

      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
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
    let phraseIndex = 0;

    const intervalId = window.setInterval(() => {
      const rotatingElement = document.getElementById('rotatingText');
      if (!rotatingElement) {
        return;
      }

      phraseIndex = (phraseIndex + 1) % ROTATING_PHRASES.length;
      rotatingElement.textContent = ROTATING_PHRASES[phraseIndex];
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [template]);

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
            html={htmlBySectionId[sectionId] ?? ''}
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
  return (
    <div className="html-fragment" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
