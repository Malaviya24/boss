import StaticPage from './StaticPage.jsx';
import html from './content/contact.html?raw';

const TITLE = 'Contact Us - MatkaKing.Services';

export default function ContactPage() {
  return <StaticPage title={TITLE} html={html} />;
}
