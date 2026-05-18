import StaticPage from './StaticPage.jsx';
import html from './content/dpboss-result-api.html?raw';

const TITLE = "DPBOSS API - World's Fastest Satta Matka Result API";

export default function DpbossResultApiPage() {
  return <StaticPage title={TITLE} html={html} />;
}
