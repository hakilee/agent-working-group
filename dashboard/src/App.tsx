import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import QueueList from './pages/QueueList';
import QueueDetail from './pages/QueueDetail';
import Workers from './pages/Workers';
import WorkerTerminal from './pages/WorkerTerminal';
import Liveness from './pages/Liveness';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/queue" element={<QueueList />} />
        <Route path="/queue/:id" element={<QueueDetail />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:session" element={<WorkerTerminal />} />
        <Route path="/liveness" element={<Liveness />} />
      </Routes>
    </Layout>
  );
}
