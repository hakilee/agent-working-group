import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './theme/ThemeContext';
import './index.css';

// Apply the persisted theme to <html> BEFORE React renders to avoid a flash.
const stored = window.localStorage.getItem('awg.theme');
const initialMode = stored === 'light' || stored === 'dark' ? stored : 'system';
const root = document.documentElement;
root.dataset.seed = '';
root.dataset.seedColorMode =
  initialMode === 'dark' ? 'dark-only'
  : initialMode === 'light' ? 'light-only'
  : 'system';
if (window.matchMedia) {
  root.dataset.seedUserColorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

const container = document.getElementById('root');
if (!container) throw new Error('root element missing');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
