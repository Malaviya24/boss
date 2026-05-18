import StaticPage from './StaticPage.jsx';
import html from './content/matka-jodi-count-chart.html?raw';

const TITLE = 'Matka Jodi Count Chart | Matka Jodi Count Record';

export default function MatkaJodiCountChartPage() {
  return <StaticPage title={TITLE} html={html} />;
}
