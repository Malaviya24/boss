import StaticPage from './StaticPage.jsx';
import html from './content/jodi-chart-family-matka.html?raw';

const TITLE = 'Matka Jodi Family Chart | Matka Jodi Family Record';

export default function JodiChartFamilyMatkaPage() {
  return <StaticPage title={TITLE} html={html} />;
}
