import StaticPage from './StaticPage.jsx';
import html from './content/about.html?raw';

const TITLE = 'WHAT IS matkaking WHO IS matkaking MATKA matkaking KYA HAI | matkaking';

export default function AboutPage() {
  return <StaticPage title={TITLE} html={html} />;
}
