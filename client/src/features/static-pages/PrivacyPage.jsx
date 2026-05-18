import StaticPage from './StaticPage.jsx';
import html from './content/privacy.html?raw';

const TITLE = 'DPBOSS Privacy Policy | DPBOSS';

export default function PrivacyPage() {
  return <StaticPage title={TITLE} html={html} />;
}
