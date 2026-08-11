import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router/index.js';
import { useCollectionStore } from './stores/collection.js';
import App from './App.vue';
import './style.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

// Hidratar ANTES de montar: leer y parsear el snapshot de localStorage cuesta
// milisegundos, así que la primera pintura ya sale con datos y nunca se espera
// a la red.
const collection = useCollectionStore(pinia);
collection.hydrate();

app.mount('#app');

// Y sincronizar en segundo plano, sin bloquear nada.
collection.sync();

// Service worker (PWA) — igual que en la versión anterior.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('SW registered: ', reg))
      .catch((err) => console.log('SW registration failed: ', err));
  });
}
