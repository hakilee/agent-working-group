import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import QueueList from './pages/QueueList';
import QueueDetail from './pages/QueueDetail';
import Workers from './pages/Workers';
import WorkerTerminal from './pages/WorkerTerminal';
import Liveness from './pages/Liveness';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/queue" element={<QueueList />} />
        <Route path="/queue/:id" element={<QueueDetail />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="/workers/:session" element={<WorkerTerminal />} />
        <Route path="/liveness" element={<Liveness />} />
      </Route>
    </Routes>
  );
}
