import { useState, useEffect } from 'react';

// ── PWA Download Button (Matches original Matka Play button style) ──
export function PWAFloatingButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showButton, setShowButton] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    ) {
      setShowButton(false);
      return;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShowButton(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowButton(false);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = () => {
    setShowModal(true);
  };

  const handleDirectInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('PWA Install choice:', outcome);
      setDeferredPrompt(null);
      setShowModal(false);
      if (outcome === 'accepted') {
        setShowButton(false);
      }
    } catch (err) {
      console.error('PWA Install error:', err);
    }
  };

  if (!showButton) return null;

  return (
    <>
      <button
        onClick={handleInstallClick}
        title="Download App"
        style={{
          position: 'fixed',
          left: '10px',
          bottom: '48px', /* Stacks exactly above the old Matka Play button which is at bottom: 8px */
          zIndex: 10,
          background: '#0054c7',
          color: '#fff',
          padding: '8px 12px',
          textDecoration: 'none',
          fontStyle: 'normal',
          fontWeight: 'bold',
          border: '1px solid #fff',
          borderRadius: '5px',
          fontSize: '15px',
          cursor: 'pointer',
          boxShadow: 'none',
        }}
      >
        Download
      </button>

      {/* ── Custom Themed Popup Modal ── */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.8)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff',
            border: '3px solid #ff002b',
            borderRadius: '10px',
            width: '90%',
            maxWidth: '380px',
            padding: '20px',
            textAlign: 'center',
            boxShadow: '0 0 20px 0 rgba(0, 0, 0, 0.4)',
          }}>
            <h2 style={{
              background: '#ff1731',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 10px',
              margin: '0 0 15px 0',
              fontSize: '22px',
              textShadow: '1px 1px 2px #000',
              textTransform: 'uppercase'
            }}>
              Download App
            </h2>

            <div style={{
              background: 'linear-gradient(187deg, #ffcc99 50%, #ffc387 50%)',
              border: '2px solid #ff0016',
              borderRadius: '8px',
              padding: '15px 10px',
              marginBottom: '20px',
              color: '#00094d',
              fontSize: '15px',
              fontWeight: 'bold',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              textShadow: '1px 1px 2px #fff',
              boxShadow: '0 0 10px rgba(0,0,0,0.2) inset'
            }}>
              {deferredPrompt
                ? "Get the best experience! Direct install the MATKAKING app to your home screen for ultra-fast access."
                : "To install this app manually:\n\nChrome: Menu (⋮) → 'Add to Home screen'\nSafari: Share button → 'Add to Home Screen'\nEdge: Menu (⋯) → 'Apps' → 'Install app'"}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
              {deferredPrompt && (
                <button
                  onClick={handleDirectInstall}
                  style={{
                    background: 'linear-gradient(45deg, navy, #005780)',
                    color: '#fff',
                    border: '2px solid #fff',
                    padding: '8px 18px',
                    borderRadius: '5px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                    transition: 'transform 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  Direct Install
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: '#e91e63',
                  color: '#fff',
                  border: '2px solid #fff',
                  padding: '8px 18px',
                  borderRadius: '5px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  transition: 'transform 0.1s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Alternative text-based button (fallback) ──
export function PWATextButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 50 }}>
      <button
        onClick={handleInstall}
        style={{
          background: '#2563eb', color: '#fff', padding: '8px 16px',
          borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontSize: '14px', fontWeight: '500',
        }}
      >
        📱 Install App
      </button>
    </div>
  );
}

// ── Hook to detect PWA installation status ──
export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const check = () => {
      const sa = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const wk = window.navigator.standalone === true;
      setIsStandalone(sa || wk);
      setIsInstalled('serviceWorker' in navigator && sa);
    };
    check();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', check);
    return () => mq.removeEventListener('change', check);
  }, []);

  return { isInstalled, isStandalone };
}

// ── Full PWAInstaller banner variant ──
export function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstallButton(true); };
    const onInstalled = () => { setShowInstallButton(false); setIsInstalled(true); setDeferredPrompt(null); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('PWA: User choice:', outcome);
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  if (isInstalled || !showInstallButton) return null;

  return (
    <div style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 50, maxWidth: '360px' }}>
      <div style={{
        background: '#2563eb', color: '#fff', padding: '16px',
        borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', border: '1px solid #3b82f6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px', height: '48px', background: '#3b82f6',
            borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Install MATKAKING App</h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#bfdbfe' }}>
              Get faster access — add to home screen for quick results.
            </p>
          </div>
          <button
            onClick={() => setShowInstallButton(false)}
            aria-label="Dismiss"
            style={{ flexShrink: 0, background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: '4px' }}
          >
            ✕
          </button>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <button
            onClick={handleInstallClick}
            style={{
              flex: 1, background: '#fff', color: '#2563eb', border: 'none',
              padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Install App
          </button>
          <button
            onClick={() => setShowInstallButton(false)}
            style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: '#bfdbfe', fontSize: '14px', cursor: 'pointer' }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}