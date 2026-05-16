import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  {
    path: '/mis-series',
    name: 'my-series',
    component: () => import('../views/MySeriesView.vue')
  },
  {
    path: '/series/:id',
    name: 'series-detail',
    component: () => import('../views/SeriesDetailView.vue')
  },
  { path: '/wishlist', name: 'wishlist', component: () => import('../views/WishlistView.vue') },
  {
    path: '/estadisticas',
    name: 'stats',
    component: () => import('../views/StatsView.vue')
  },
  { path: '/buscar', name: 'search', component: () => import('../views/SearchView.vue') }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});
