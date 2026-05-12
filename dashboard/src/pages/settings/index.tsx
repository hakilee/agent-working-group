import ThemeToggle from './_components/theme-toggle';
import { Page, PageHeader } from '../../components/ui/page';

export default function Settings() {
  return (
    <Page>
      <PageHeader eyebrow="Settings" title="Dashboard settings" />
      <section className="max-w-xl border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
        <div className="mb-4 grid gap-1.5">
          <h2 className="text-sm font-bold tracking-[-.01em] text-ops-ink dark:text-[#eef3ec]">Appearance</h2>
          <p className="text-[10px] text-ops-muted dark:text-[#839087]">Theme state is applied to the document root so System always matches the resolved UI.</p>
        </div>
        <ThemeToggle />
      </section>
    </Page>
  );
}
