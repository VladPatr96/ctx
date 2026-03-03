import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'reactflow/dist/style.css';

// Mark the start of React initialization
performance.mark('react-init-start');

// Measure startup time from navigation start
const measureStartupTime = () => {
  if (performance && performance.timing) {
    const navStart = performance.timing.navigationStart;
    const now = Date.now();
    const startupTime = now - navStart;

    if (import.meta.env.DEV) {
      console.log(`[Performance] Startup time: ${startupTime}ms`);

      if (startupTime > 3000) {
        console.warn(`[Performance] Startup time exceeds 3s target: ${startupTime}ms`);
      } else {
        console.log('[Performance] Startup time is within 3s target');
      }
    }

    // Mark React as mounted
    performance.mark('react-mounted');

    // Measure React initialization time
    try {
      performance.measure('react-init', 'react-init-start', 'react-mounted');
      const reactInitMeasure = performance.getEntriesByName('react-init')[0];

      if (import.meta.env.DEV) {
        console.log(`[Performance] React initialization: ${Math.round(reactInitMeasure.duration)}ms`);
      }
    } catch (error) {
      // Performance API not fully supported, ignore
    }

    return startupTime;
  }
  return 0;
};

// Remove initial loader with fade-out animation
const removeInitialLoader = () => {
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => {
      loader.remove();
    }, 300);
  }
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Measure and remove loader after React mounts
requestAnimationFrame(() => {
  measureStartupTime();
  removeInitialLoader();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore SW registration errors in local/dev environments.
    });
  });
}
