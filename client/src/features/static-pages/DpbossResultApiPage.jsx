import StaticPage from './StaticPage.jsx';
import html from './content/dpboss-result-api-documentation.html?raw';

const TITLE = 'DPBOSS Result API Documentation';

export default function DpbossResultApiPage() {
  return <StaticPage title={TITLE} html={html} />;
}
