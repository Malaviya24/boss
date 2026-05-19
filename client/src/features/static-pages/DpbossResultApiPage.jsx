import StaticPage from './StaticPage.jsx';
import html from './content/dpboss-result-api.html?raw';

const TITLE = "matkaking API - World's Fastest Satta Matka Result API";

export default function matkakingResultApiPage() {
  return <StaticPage title={TITLE} html={html} />;
}
