import { ref } from 'vue';

// Detecta long-press (mouse y touch). Devuelve handlers para v-on y un flag
// reactivo `pressing`. Mismo umbral de 500 ms que la versión React.
export function useLongPress(callback, options = {}) {
  const { threshold = 500, onCancel = () => {} } = options;
  const pressing = ref(false);
  let timer = null;
  let isLongPress = false;

  function start(event) {
    if (event.type === 'touchstart') event.preventDefault();
    isLongPress = false;
    pressing.value = true;
    timer = setTimeout(() => {
      isLongPress = true;
      pressing.value = false;
      callback(event);
    }, threshold);
  }

  function cancel(event) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pressing.value = false;
    if (!isLongPress) onCancel(event);
    isLongPress = false;
  }

  function onClick(event) {
    // Si fue long-press, anula el click posterior.
    if (isLongPress) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return {
    pressing,
    handlers: {
      mousedown: start,
      mouseup: cancel,
      mouseleave: cancel,
      touchstart: start,
      touchend: cancel,
      touchmove: cancel,
      click: onClick
    }
  };
}
