import { reactive, readonly } from 'vue';

// Estado global compartido del diálogo de confirmación. Hay un único
// <ConfirmDialog> montado en App.vue que lo lee; cualquier vista llama a
// confirm(...) y recibe una promesa que resuelve true/false.
const state = reactive({
  open: false,
  title: '',
  message: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  danger: false
});

let resolver = null;

function settle(result) {
  state.open = false;
  if (resolver) {
    const r = resolver;
    resolver = null;
    r(result);
  }
}

export function useConfirm() {
  function confirm(opts = {}) {
    state.title = opts.title || '¿Confirmar acción?';
    state.message = opts.message || '';
    state.confirmText = opts.confirmText || 'Confirmar';
    state.cancelText = opts.cancelText || 'Cancelar';
    state.danger = !!opts.danger;
    state.open = true;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  return {
    state: readonly(state),
    confirm,
    _accept: () => settle(true),
    _cancel: () => settle(false)
  };
}
