import StaticPage from './StaticPage.jsx';
import html from './content/fix-open-to-close-by-date.html?raw';

const TITLE = 'Fix Open To Close By Date | Fix Open To Close Result';

export default function FixOpenToCloseByDatePage() {
  return <StaticPage title={TITLE} html={html} />;
}
