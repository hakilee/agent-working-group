import ThemeToggle from '../components/ThemeToggle';

export default function Settings() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="title-xl">Dashboard settings</h1>
        </div>
      </header>
      <section className="panel panel-pad max-w-xl">
        <h2 className="title-md mb-3">Appearance</h2>
        <ThemeToggle />
      </section>
    </div>
  );
}
