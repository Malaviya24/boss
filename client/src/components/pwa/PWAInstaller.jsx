import { useState, useEffect } from 'react';

// Simple PWA Install Button that always shows for testing
export function PWAFloatingButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showButton, setShowButton] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const isWebkitStandalone = window.navigator.standalone === true;
      return isStandalone || isWebkitStandalone;
    };

    if (checkInstalled()) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (event) => {
      console.log('PWA: Install prompt available');
      event.preventDefault();
      setDeferredPrompt(event);
      setShowButton(true);
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      console.log('PWA: App installed');
      setShowButton(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Show button after 3 seconds for testing (remove in production)
    const timer = setTimeout(() => {
      if (!isInstalled && !showButton) {
        setShowButton(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Fallback - show manual instructions
      alert('To install this app:\n\n' +
            'Chrome: Menu (⋮) → "Install app" or "Add to Home screen"\n' +
            'Safari: Share button → "Add to Home Screen"\n' +
            'Edge: Menu (⋯) → "Apps" → "Install this site as an app"');
      return;
    }

    try {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      console.log('PWA Install choice:', choiceResult.outcome);
      
      setDeferredPrompt(null);
      setShowButton(false);
    } catch (error) {
      console.error('PWA Install error:', error);
    }
  };

  // Don't show if already installed
  if (isInstalled) {
    return null;
  }

  // Always show the button for now (you can add conditions later)
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={handleInstall}
        className="group relative w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-300 flex items-center justify-center"
        title="Install MATKAKING App"
        style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1)'
        }}
      >
        {/* Matka Play Style Icon */}
        <div className="relative">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex items-center justify-center">
              <svg
                 className="w-4 h-4 text-white"
                 fill="currentColor"
                 viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
          </div>
          
          {/* Pulsing indicator */}
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full" />
        </div>
        
        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          Install Matka App
          <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
        </div>
      </button>
    </div>
  );
}

// Alternative text-based button (use if icon doesn't work)
export function PWATextButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={handleInstall}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg transition-colors duration-200 text-sm font-medium"
      >
        📱 Install App
      </button>
    </div>
  );
}

// Hook to detect PWA installation status
export function usePWA() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  
  useEffect(() => {
    // Check if running in standalone mode
    const checkStandalone = () => {
      const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      const webkitStandalone = window.navigator.standalone === true;
      
      setIsStandalone(standalone || webkitStandalone);
    };
    
    // Check if app appears to be installed
    const checkInstalled = () => {
      const installed = 'serviceWorker' in navigator && 
                       window.matchMedia('(display-mode: standalone)').matches;
      setIsInstalled(installed);
    };
    
    checkStandalone();
    checkInstalled();
    
    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkStandalone);
    
    return () => {
      mediaQuery.removeEventListener('change', checkStandalone);
    };
  }, []);
  
  return { isInstalled, isStandalone };
}

// Alternative simple button for testing
export function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if running in PWA mode
    if (window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (event) => {
      console.log('PWA: beforeinstallprompt event fired');
      
      // Prevent the mini-infobar from appearing on mobile
      event.preventDefault();
      
      // Save the event for later use
      setDeferredPrompt(event);
      setShowInstallButton(true);
    };

    // Listen for app installation
    const handleAppInstalled = () => {
      console.log('PWA: App was installed');
      setShowInstallButton(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Show the installation prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const choiceResult = await deferredPrompt.userChoice;
    
    console.log('PWA: User choice:', choiceResult.outcome);
    
    if (choiceResult.outcome === 'accepted') {
      console.log('PWA: User accepted the install prompt');
    } else {
      console.log('PWA: User dismissed the install prompt');
    }

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  // Don't show if already installed or prompt not available
  if (isInstalled || !showInstallButton) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-blue-600 text-white p-4 rounded-lg shadow-lg border border-blue-500">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg 
                className="w-6 h-6" 
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Install MATKAKING App</h3>
            <p className="text-xs text-blue-100 mt-1">
              Get faster access with our app! Add to home screen for quick results.
            </p>
          </div>
          <button
            onClick={() => setShowInstallButton(false)}
            className="flex-shrink-0 text-blue-200 hover:text-white p-1"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleInstallClick}
            className="flex-1 bg-white text-blue-600 py-2 px-4 rounded-lg text-sm font-semibold hover:bg-blue-50 transition-colors"
          >
            Install App
          </button>
          <button
            onClick={() => setShowInstallButton(false)}
            className="px-4 py-2 text-blue-100 text-sm hover:text-white transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}