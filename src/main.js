import { mount } from 'svelte';
import Chart from 'chart.js/auto';
import App from './App.svelte';
import './style.css';

window.Chart = Chart;

const app = mount(App, { target: document.getElementById('app') });

export default app;
