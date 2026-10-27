// Entry of the self-contained local viewer: reads the graph the CLI embedded in the page and renders it with
// the website home's tree, card and footer styles (home.css).
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/core.css';
import '../site/home.css';
import './viewer.css';
import { loadGraph } from '../map/loadGraph';
import { Viewer } from './Viewer';

const data = document.getElementById('reasontrail-data')?.textContent;
createRoot(document.getElementById('root')!).render(<Viewer loaded={loadGraph(data)} />);
