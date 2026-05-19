import StaticPage from './StaticPage.jsx';
import html from './content/privacy.html?raw';

const TITLE = 'matkaking Privacy Policy | matkaking';

export default function PrivacyPage() {
  return <StaticPage title={TITLE} html={html} />;
}
