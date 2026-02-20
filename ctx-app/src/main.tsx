import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'reactflow/dist/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore SW registration errors in local/dev environments.
    });
  });
}
