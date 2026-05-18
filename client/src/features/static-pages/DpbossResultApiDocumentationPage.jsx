import StaticPage from './StaticPage.jsx';
import html from './content/dpboss-result-api-documentation.html?raw';

const TITLE = 'Dpboss Result API Documentation';

export default function DpbossResultApiDocumentationPage() {
  return <StaticPage title={TITLE} html={html} />;
}
