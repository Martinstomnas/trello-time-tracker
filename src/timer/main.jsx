import React from 'react';
import { createRoot } from 'react-dom/client';
import TimerApp from './TimerApp.jsx';

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById('root'));
root.render(<TimerApp t={t} />);
