import ThemeToggle from '../components/theme-toggle';
import { Page, PageHeader } from '../components/ui/page';

export default function Settings() {
  return (
    <Page>
      <PageHeader eyebrow="Settings" title="Dashboard settings" />
      <section className="panel panel-pad max-w-xl">
        <div className="page-title-stack mb-4">
          <h2 className="title-md">Appearance</h2>
          <p className="caption">Theme state is applied to the document root so System always matches the resolved UI.</p>
        </div>
        <ThemeToggle />
      </section>
    </Page>
  );
}
