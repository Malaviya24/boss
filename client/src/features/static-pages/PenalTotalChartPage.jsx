import StaticPage from './StaticPage.jsx';
import html from './content/penal-total-chart.html?raw';

const TITLE = 'Penal Total Chart | Penal Total | Penal Total Record';

export default function PenalTotalChartPage() {
  return <StaticPage title={TITLE} html={html} />;
}
