import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Seed Design picks up its theme tokens from the `data-seed` attribute on
// the document root. Force dark mode for the operator dashboard.
document.documentElement.setAttribute('data-seed', '');
document.documentElement.setAttribute('data-seed-color-mode', 'dark-only');

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
