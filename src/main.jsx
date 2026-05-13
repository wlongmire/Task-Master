import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { migrate, rolloverTodos } from './db';

migrate();
rolloverTodos();

createRoot(document.getElementById('root')).render(<App />);
