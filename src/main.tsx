import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import App from './App';
import './styles.css';

const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1f6feb',
          borderRadius: 8,
          fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        },
      }}
    >
      <AntApp>
        <HashRouter>
          <App />
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
