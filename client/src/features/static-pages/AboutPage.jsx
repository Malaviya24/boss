import StaticPage from './StaticPage.jsx';
import html from './content/about.html?raw';

const TITLE = 'WHAT IS DPBOSS WHO IS DPBOSS MATKA DPBOSS KYA HAI | DPBOSS';

export default function AboutPage() {
  return <StaticPage title={TITLE} html={html} />;
}
