import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/**
 * Todos los iconos llevan `width`/`height` explícitos. Sin ellos, un SVG con
 * `viewBox` no tiene tamaño intrínseco y el navegador decide: dentro de un
 * contenedor flex sale de 0 px (invisible) o de 300 px (gigante). Por eso el
 * valor por defecto no es opcional.
 */
function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Icon>
);

export const IconGrid = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Icon>
);

export const IconHeart = ({ filled, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.8a4.4 4.4 0 0 1 7.5 3.1c0 5-7.5 9.6-7.5 9.6Z" />
  </Icon>
);

export const IconSettings = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
);

export const IconSearch = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const IconPlay = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l11-6.5a1 1 0 0 0 0-1.7l-11-6.5A1 1 0 0 0 8 5.5Z" />
  </Icon>
);

export const IconPause = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
  </Icon>
);

export const IconCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
);

export const IconClose = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconChevronLeft = (props: IconProps) => (
  <Icon {...props}>
    <path d="m14.5 5-7 7 7 7" />
  </Icon>
);

export const IconChevronRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9.5 5 7 7-7 7" />
  </Icon>
);

export const IconSun = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const IconMoon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Icon>
);

export const IconMonitor = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Icon>
);

export const IconRefresh = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4.5V11h-6.5" />
  </Icon>
);

export const IconLogout = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Icon>
);

export const IconMusic = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 18V6.5l10-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Icon>
);

export const IconFilm = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4" width="19" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M2.5 9h4.5M2.5 15h4.5M17 9h4.5M17 15h4.5" />
  </Icon>
);

export const IconList = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Icon>
);

export const IconSkipNext = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <path d="M6 5.6v12.8a1 1 0 0 0 1.5.85l8.5-6.4a1 1 0 0 0 0-1.7l-8.5-6.4A1 1 0 0 0 6 5.6Z" />
    <rect x="17" y="4.5" width="2.4" height="15" rx="1" />
  </Icon>
);

export const IconSkipPrev = (props: IconProps) => (
  <Icon {...props} fill="currentColor" stroke="none">
    <path d="M18 5.6v12.8a1 1 0 0 1-1.5.85l-8.5-6.4a1 1 0 0 1 0-1.7l8.5-6.4A1 1 0 0 1 18 5.6Z" />
    <rect x="4.6" y="4.5" width="2.4" height="15" rx="1" />
  </Icon>
);

export const IconAlert = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 9.5v4M12 17h.01" />
  </Icon>
);

export const IconTrash = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </Icon>
);

export const IconClock = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const IconArrowDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4.5v15M6 13.5l6 6 6-6" />
  </Icon>
);

export const IconArrowUp = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 19.5v-15M6 10.5l6-6 6 6" />
  </Icon>
);

export const IconInbox = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 13.5 5.5 5h13L21 13.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5.5Z" />
    <path d="M3 13.5h5l1 2.5h6l1-2.5h5" />
  </Icon>
);

export const IconFolder = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z" />
  </Icon>
);
