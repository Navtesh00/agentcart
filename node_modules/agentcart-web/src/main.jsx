import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <Toaster position="top-right" theme="dark" richColors />
    <App />
  </ErrorBoundary>
);
