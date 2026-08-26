// @ts-nocheck
import './lib/i18n.js'
import App from './App.svelte'
import './app.css'
import './app.scss'
import { mount } from 'svelte'

const app = mount(App, {
  target: document.getElementById('app'),
});

export default app
