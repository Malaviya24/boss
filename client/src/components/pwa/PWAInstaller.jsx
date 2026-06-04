import { useState, useEffect, useCallback } from 'react';

// ── Browser & OS detection ──
function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edge|Edg|OPR|Opera/i.test(ua);
  const isFirefox = /Firefox|FxiOS/i.test(ua);
  const isEdge = /Edg|Edge/i.test(ua);
  const isSamsung = /SamsungBrowser/i.test(ua);
  const isOpera = /OPR|Opera/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);

  let browser = 'other';
  if (isChrome) browser = 'chrome';
  else if (isSafari) browser = 'safari';
  else if (isFirefox) browser = 'firefox';
  else if (isEdge) browser = 'edge';
  else if (isSamsung) browser = 'samsung';
  else if (isOpera) browser = 'opera';

  let os = 'other';
  if (isIOS) os = 'ios';
  else if (isAndroid) os = 'android';
  else if (/Win/i.test(ua)) os = 'windows';
  else if (/Mac/i.test(ua)) os = 'mac';

  return { browser, os, isMobile, isIOS, isAndroid };
}

function isStandalone() {
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true
  );
}

// ── Install instructions per browser/OS ──
function getInstallSteps(platform) {
  const { browser, os, isIOS } = platform;

  if (isIOS && browser === 'safari') {
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '📤', text: 'Tap the Share button at the bottom of Safari' },
        { icon: '📜', text: 'Scroll down in the share menu' },
        { icon: '➕', text: "Tap 'Add to Home Screen'" },
        { icon: '✅', text: "Tap 'Add' in the top right corner" },
      ],
      note: 'The app icon will appear on your home screen!',
    };
  }

  if (isIOS) {
    // iOS but not Safari (Chrome iOS, Firefox iOS, etc.)
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '🌐', text: 'Open this page in Safari browser' },
        { icon: '📤', text: 'Tap the Share button' },
        { icon: '➕', text: "Tap 'Add to Home Screen'" },
        { icon: '✅', text: "Tap 'Add' to install" },
      ],
      note: 'PWA install is only supported through Safari on iOS.',
    };
  }

  if (browser === 'chrome') {
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '⋮', text: 'Tap the 3-dot menu (⋮) at the top right' },
        { icon: '📱', text: os === 'android' ? "Tap 'Add to Home screen'" : "Tap 'Install app...'" },
        { icon: '✅', text: "Tap 'Install' to confirm" },
      ],
      note: 'The app will be installed instantly!',
    };
  }

  if (browser === 'samsung') {
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '☰', text: 'Tap the menu icon (☰) at the bottom' },
        { icon: '➕', text: "Tap 'Add page to'" },
        { icon: '📱', text: "Select 'Home screen'" },
        { icon: '✅', text: "Tap 'Add' to confirm" },
      ],
      note: 'Find the app on your home screen!',
    };
  }

  if (browser === 'firefox') {
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '⋮', text: 'Tap the 3-dot menu (⋮)' },
        { icon: '📱', text: "Tap 'Install'" },
        { icon: '✅', text: 'Confirm the installation' },
      ],
      note: os === 'android'
        ? 'Firefox on Android supports PWA install!'
        : 'For the best experience, use Chrome or Edge.',
    };
  }

  if (browser === 'edge') {
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '⋯', text: 'Tap the menu (⋯) at the bottom or top' },
        { icon: '📱', text: "Tap 'Apps' → 'Install this site as an app'" },
        { icon: '✅', text: "Tap 'Install' to confirm" },
      ],
      note: 'The app will open like a native application!',
    };
  }

  if (browser === 'opera') {
    return {
      title: 'Install MATKAKING App',
      steps: [
        { icon: '⋮', text: 'Tap the 3-dot menu (⋮)' },
        { icon: '🏠', text: "Tap 'Home screen'" },
        { icon: '✅', text: "Tap 'Add' to confirm" },
      ],
      note: 'The app shortcut will appear on your home screen!',
    };
  }

  // Generic fallback
  return {
    title: 'Install MATKAKING App',
    steps: [
      { icon: '📱', text: 'Open this website in Chrome, Edge, or Safari' },
      { icon: '⋮', text: 'Open the browser menu' },
      { icon: '➕', text: "Look for 'Install app' or 'Add to Home screen'" },
      { icon: '✅', text: 'Follow the prompts to install' },
    ],
    note: 'For best results, use Chrome on Android or Safari on iPhone.',
  };
}

// ── Inline Styles ──
const overlay = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.85)',
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  animation: 'pwaFadeIn 0.25s ease-out',
};

const modal = {
  background: '#fff',
  border: '3px solid #ff002b',
  borderRadius: '14px',
  width: '100%',
  maxWidth: '400px',
  padding: '0',
  textAlign: 'center',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  overflow: 'hidden',
  animation: 'pwaSlideUp 0.3s ease-out',
};

const header = {
  background: 'linear-gradient(135deg, #ff1731 0%, #c2185b 100%)',
  color: '#fff',
  padding: '14px 16px',
  margin: 0,
  fontSize: '20px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  textShadow: '1px 1px 3px rgba(0,0,0,0.3)',
};

const body = {
  padding: '20px 16px',
};

const stepRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  marginBottom: '8px',
  background: '#f8f9fa',
  borderRadius: '10px',
  border: '1px solid #e9ecef',
  textAlign: 'left',
};

const stepIcon = {
  fontSize: '22px',
  width: '38px',
  height: '38px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#fff',
  borderRadius: '10px',
  border: '1px solid #dee2e6',
  flexShrink: 0,
};

const stepNumber = {
  position: 'absolute',
  top: '-4px',
  left: '-4px',
  width: '18px',
  height: '18px',
  background: '#ff1731',
  color: '#fff',
  borderRadius: '50%',
  fontSize: '11px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

const stepText = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#1a1a2e',
  lineHeight: 1.4,
};

const noteBox = {
  background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
  border: '1px solid #a5d6a7',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#2e7d32',
  marginTop: '12px',
};

const closeBtn = {
  display: 'block',
  width: '100%',
  padding: '14px',
  background: 'linear-gradient(135deg, #e91e63, #c2185b)',
  color: '#fff',
  border: 'none',
  fontSize: '16px',
  fontWeight: 700,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

// ── Keyframe injection ──
const STYLE_ID = 'pwa-installer-keyframes';
function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pwaFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes pwaSlideUp {
      from { opacity: 0; transform: translateY(40px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes pwaPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════
// ── Main Export: PWAFloatingButton ──
// ═══════════════════════════════════════════════════════════
export function PWAFloatingButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showButton, setShowButton] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [installing, setInstalling] = useState(false);

  const platform = detectPlatform();

  useEffect(() => {
    injectKeyframes();
  }, []);

  // Hide during loading screen
  useEffect(() => {
    const checkLoading = () => {
      setIsAppLoading(!!document.querySelector('.clone-loading'));
    };
    checkLoading();
    const observer = new MutationObserver(checkLoading);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // PWA prompt & install events
  useEffect(() => {
    if (isStandalone()) {
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
      setInstalling(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      // Chrome/Edge: trigger native install prompt directly
      try {
        setInstalling(true);
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        setInstalling(false);
        if (outcome === 'accepted') {
          setShowButton(false);
        }
      } catch (err) {
        console.error('PWA Install error:', err);
        setInstalling(false);
        // If native prompt fails, show manual instructions
        setShowModal(true);
      }
      return;
    }
    // No native prompt: show guided install instructions
    setShowModal(true);
  }, [deferredPrompt]);

  if (isAppLoading || !showButton) return null;

  const installGuide = getInstallSteps(platform);

  return (
    <>
      <button
        onClick={handleInstallClick}
        disabled={installing}
        title="Download App"
        className="mp-btn"
        style={{
          bottom: '48px',
          cursor: installing ? 'wait' : 'pointer',
          opacity: installing ? 0.7 : 1,
        }}
      >
        <i>{installing ? 'Installing...' : 'Download'}</i>
      </button>

      {/* ── Guided Install Modal (for browsers without native prompt) ── */}
      {showModal && (
        <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={modal}>
            <h2 style={header}>
              📱 {installGuide.title}
            </h2>

            <div style={body}>
              {/* Step-by-step guide */}
              {installGuide.steps.map((step, idx) => (
                <div key={idx} style={stepRow}>
                  <div style={{ position: 'relative' }}>
                    <div style={stepIcon}>{step.icon}</div>
                    <div style={stepNumber}>{idx + 1}</div>
                  </div>
                  <span style={stepText}>{step.text}</span>
                </div>
              ))}

              {/* Success note */}
              <div style={noteBox}>
                ✅ {installGuide.note}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              style={closeBtn}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Hook to detect PWA installation status ──
export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);

  useEffect(() => {
    const check = () => {
      const sa = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const wk = window.navigator.standalone === true;
      setIsStandaloneMode(sa || wk);
      setIsInstalled('serviceWorker' in navigator && sa);
    };
    check();
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', check);
    return () => mq.removeEventListener('change', check);
  }, []);

  return { isInstalled, isStandalone: isStandaloneMode };
}

// ── PWAInstaller (banner variant, kept for backward compatibility) ──
export function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isInstalledAlready, setIsInstalledAlready] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setIsInstalledAlready(true);
      return;
    }

    const onPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstallButton(true); };
    const onInstalled = () => { setShowInstallButton(false); setIsInstalledAlready(true); setDeferredPrompt(null); };

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
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  if (isInstalledAlready || !showInstallButton) return null;

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

// ── PWATextButton (simple fallback, kept for backward compat) ──
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