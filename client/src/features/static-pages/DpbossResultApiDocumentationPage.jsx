import { useEffect } from 'react';
import html from './content/dpboss-result-api-documentation.html?raw';

const TITLE = 'Dpboss Result API Documentation';
const TAILWIND_CDN_ID = 'tailwind-cdn-script';
const TAB_SWITCH_SCRIPT_ID = 'dpboss-doc-tab-switch';

/**
 * The documentation page was originally styled with Tailwind via CDN and uses
 * inline `onclick="switchTab(...)"` handlers. We dynamically inject the
 * Tailwind script and a global `switchTab` function so the converted HTML
 * renders correctly inside the React tree.
 */
export default function DpbossResultApiDocumentationPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    // Inject Tailwind CDN if not already present
    let tailwindScript = document.getElementById(TAILWIND_CDN_ID);
    let tailwindInjected = false;
    if (!tailwindScript) {
      tailwindScript = document.createElement('script');
      tailwindScript.id = TAILWIND_CDN_ID;
      tailwindScript.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(tailwindScript);
      tailwindInjected = true;
    }

    // Inject the tab-switch global function
    let tabScript = document.getElementById(TAB_SWITCH_SCRIPT_ID);
    let tabInjected = false;
    if (!tabScript) {
      tabScript = document.createElement('script');
      tabScript.id = TAB_SWITCH_SCRIPT_ID;
      tabScript.text = `
        window.switchTab = function (tabId) {
          document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.remove('active'); });
          document.querySelectorAll('.tab-content').forEach(function (content) { content.classList.remove('active'); });
          var trigger = document.querySelector('[onclick="switchTab(\\'' + tabId + '\\')"]');
          if (trigger) trigger.classList.add('active');
          var content = document.getElementById(tabId);
          if (content) content.classList.add('active');
        };
      `;
      document.head.appendChild(tabScript);
      tabInjected = true;
    }

    return () => {
      if (tailwindInjected) {
        const el = document.getElementById(TAILWIND_CDN_ID);
        if (el) el.remove();
      }
      if (tabInjected) {
        const el = document.getElementById(TAB_SWITCH_SCRIPT_ID);
        if (el) el.remove();
      }
    };
  }, []);

  return (
    <div
      className="dpboss-doc-page bg-gray-100 font-sans"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
