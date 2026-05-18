import StaticPage from './StaticPage.jsx';
import html from './content/tos.html?raw';

const TITLE = 'DPBOSS - Terms & Conditions (TOS) Satta Matka';

export default function TosPage() {
  return <StaticPage title={TITLE} html={html} />;
}
