import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsApp from './SettingsApp.jsx';

const t = window.TrelloPowerUp.iframe();
const root = createRoot(document.getElementById('root'));
root.render(<SettingsApp t={t} />);
