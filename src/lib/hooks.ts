import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Lee y escribe una preferencia en localStorage, tolerando entornos sin storage. */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* modo privado o cuota llena: la preferencia simplemente no persiste */
      }
    },
    [key],
  );

  return [value, update];
}

/** Escucha una media query. Evita detectar el dispositivo por user-agent. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));

  useEffect(() => {
    const list = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Retrasa un valor: la búsqueda no dispara una petición por pulsación. */
export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Impide desplazar el fondo mientras hay una capa abierta. El armazón no
 * desplaza la ventana, sino la región de contenido, así que hay que bloquear
 * las dos.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const content = document.getElementById('contenido');
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const previousContentOverflow = content?.style.overflowY ?? '';
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    if (content) content.style.overflowY = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      if (content) content.style.overflowY = previousContentOverflow;
    };
  }, [active]);
}

/** Ejecuta `handler` al pulsar Escape mientras `active`. */
export function useEscape(active: boolean, handler: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, handler]);
}

/**
 * Atrapa el foco dentro de un contenedor y lo devuelve al elemento que lo abrió
 * al cerrarse. Imprescindible en hojas y diálogos.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    opener.current = document.activeElement as HTMLElement | null;
    const container = ref.current;
    if (!container) return;

    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null);

    const first = focusables()[0];
    if (first) first.focus();
    else container.setAttribute('tabindex', '-1');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      opener.current?.focus?.();
    };
  }, [active]);

  return ref;
}

/** Observa un elemento y avisa cuando entra en pantalla (scroll infinito). */
export function useOnScreen<T extends HTMLElement>(onEnter: () => void, enabled = true) {
  const ref = useRef<T | null>(null);
  const callback = useRef(onEnter);
  callback.current = onEnter;

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}

/** Evita el parpadeo cuando el valor se resuelve en el primer efecto. */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
