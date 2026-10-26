import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { Site } from './Site';
import { startAnalytics } from './analytics';

// The website only: the local viewer (src/viewer/main.tsx) and the CLI's HTML never load analytics.
startAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
