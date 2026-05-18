import StaticPage from './StaticPage.jsx';
import html from './content/penal-count-chart.html?raw';

const TITLE = 'Penal Count Chart | Penal Count | Penal Count Record';

export default function PenalCountChartPage() {
  return <StaticPage title={TITLE} html={html} />;
}
