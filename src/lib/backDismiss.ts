import { useEffect, useRef } from 'react';

type MarkerState = { __msModal?: true } | null;

/**
 * Cierra una capa con el botón/gesto "atrás" del navegador o del móvil: al
 * abrirse se apila una entrada en el historial y al retroceder se cierra en vez
 * de salir de la aplicación.
 */
export function useBackDismiss(active: boolean, onDismiss: () => void): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;

    window.history.pushState({ __msModal: true } satisfies MarkerState, '');

    let dismissedByPop = false;
    const onPop = () => {
      dismissedByPop = true;
      dismissRef.current();
    };

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Cierre programático: retiramos la entrada que habíamos apilado, si sigue ahí.
      const state = window.history.state as MarkerState;
      if (!dismissedByPop && state?.__msModal) window.history.back();
    };
  }, [active]);
}
