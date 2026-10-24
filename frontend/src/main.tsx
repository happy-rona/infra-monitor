import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api/client';
import { App } from './App';
import { store } from './store/resourceStore';
import './styles.css';

const roots = store.primeRoots(api.clusters()).catch(() => {});
void Promise.race([roots, new Promise((resolve) => setTimeout(resolve, 300))]).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
