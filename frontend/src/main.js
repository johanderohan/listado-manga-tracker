import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router/index.js';
import App from './App.vue';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// Service worker (PWA) — igual que en la versión anterior.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('SW registered: ', reg))
      .catch((err) => console.log('SW registration failed: ', err));
  });
}
