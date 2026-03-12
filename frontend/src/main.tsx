import React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'
import App from './App'

// =========================================================
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// 【核心新增】：引入官方的 Kusto 后台解析 Worker
import kustoWorker from '@kusto/monaco-kusto/release/esm/kusto.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    
    // 【核心新增】：当 Monaco 请求 kusto 语言服务时，返回专用 Worker
    if (label === 'kusto') return new kustoWorker(); 
    
    return new editorWorker();
  },
};

loader.config({ monaco });
// =========================================================

const container = document.getElementById('root')
const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)