import { useEffect, useRef } from 'react';
import html from './content/matkaking-result-api-documentation.html?raw';

const TITLE = 'matkaking Result API Documentation';

/**
 * Renders the API documentation page. The HTML content includes a Tailwind CDN
 * <script> tag and an inline switchTab function. We use a ref + manual script
 * execution to ensure the scripts run after the HTML is injected into the DOM.
 */
export default function matkakingResultApiDocumentationPage() {
  const containerRef = useRef(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Execute any <script> tags that were injected via dangerouslySetInnerHTML
    // (React doesn't execute scripts inserted this way by default)
    const scripts = containerRef.current.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      // Copy attributes
      Array.from(oldScript.attributes).forEach((attr) => {
        if (attr.name !== 'src') {
          newScript.setAttribute(attr.name, attr.value);
        }
      });
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="matkaking-doc-page"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
