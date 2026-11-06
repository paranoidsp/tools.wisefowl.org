/** Inline SVG icon set (16px grid, 1.5px strokes, currentColor). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <defs>
      <linearGradient id="mvs-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7c9cff" />
        <stop offset="0.55" stopColor="#c58cff" />
        <stop offset="1" stopColor="#ffb454" />
      </linearGradient>
    </defs>
    <circle cx="10" cy="10" r="8.25" fill="none" stroke="url(#mvs-mark)" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="4.6" fill="none" stroke="url(#mvs-mark)" strokeWidth="1.5" opacity="0.75" />
    <circle cx="10" cy="10" r="1.6" fill="url(#mvs-mark)" />
  </svg>
);

export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 4 2.5 7l3 3" />
    <path d="M2.5 7H10a3.5 3.5 0 0 1 0 7H7.5" />
  </Svg>
);
export const IconRedo = (p: P) => (
  <Svg {...p}>
    <path d="m10.5 4 3 3-3 3" />
    <path d="M13.5 7H6a3.5 3.5 0 0 0 0 7h2.5" />
  </Svg>
);
export const IconCamera = (p: P) => (
  <Svg {...p}>
    <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1.3l1-1.5h4.4l1 1.5h1.3A1.5 1.5 0 0 1 14 5.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
    <circle cx="8" cy="8.3" r="2.4" />
  </Svg>
);
export const IconRecord = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <circle cx="8" cy="8" r="2.6" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10" />
  </Svg>
);
export const IconFocus = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3" />
  </Svg>
);
export const IconPanels = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M5.5 3v10M10.5 3v10" />
  </Svg>
);
export const IconFullscreen = (p: P) => (
  <Svg {...p}>
    <path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" />
    <path d="M2.5 2.5 6 6M13.5 2.5 10 6M2.5 13.5 6 10M13.5 13.5 10 10" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconPause = (p: P) => (
  <Svg {...p}>
    <rect x="3.75" y="3" width="3" height="10" rx="0.9" fill="currentColor" stroke="none" />
    <rect x="9.25" y="3" width="3" height="10" rx="0.9" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25" />
  </Svg>
);
export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.7l1.5 1.5h4.8A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
  </Svg>
);
export const IconMusic = (p: P) => (
  <Svg {...p}>
    <path d="M6 12V3.5l7-1.5V10.5" />
    <circle cx="4.25" cy="12" r="1.75" />
    <circle cx="11.25" cy="10.5" r="1.75" />
  </Svg>
);
export const IconVolume = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 6v4h2.5l3.5 3V3L5 6z" />
    <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" />
  </Svg>
);
export const IconMute = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 6v4h2.5l3.5 3V3L5 6z" />
    <path d="m11 6 3 4M14 6l-3 4" />
  </Svg>
);
export const IconLoop = (p: P) => (
  <Svg {...p}>
    <path d="M11.5 2.5 13.5 4.5l-2 2" />
    <path d="M13.5 4.5H5A2.5 2.5 0 0 0 2.5 7v.5M4.5 13.5l-2-2 2-2" />
    <path d="M2.5 11.5H11A2.5 2.5 0 0 0 13.5 9v-.5" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);
export const IconEyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M6.3 3.8A6.4 6.4 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.8 2.3M10.2 11.9a6 6 0 0 1-2.2.6C4 12.5 1.5 8 1.5 8a11.3 11.3 0 0 1 2.6-3.1" />
    <path d="M2 2l12 12" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const IconMore = (p: P) => (
  <Svg {...p}>
    <circle cx="3.5" cy="8" r="0.9" fill="currentColor" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" />
    <circle cx="12.5" cy="8" r="0.9" fill="currentColor" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" />
  </Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
    <path d="M2.5 2.5v3h3" />
  </Svg>
);
export const IconEdit = (p: P) => (
  <Svg {...p}>
    <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5v-3z" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 6 3.5 3.5L11.5 6" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m6 4.5 3.5 3.5L6 11.5" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Svg>
);
export const IconMod = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconWarn = (p: P) => (
  <Svg {...p}>
    <path d="M8 2 14.5 13.5h-13z" />
    <path d="M8 6.5v3M8 11.6v.1" />
  </Svg>
);
export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="M8 2 14 5.2 8 8.4 2 5.2z" />
    <path d="m2 8 6 3.2L14 8M2 10.8 8 14l6-3.2" />
  </Svg>
);
export const IconSparkle = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.5c.4 3.3 1.7 5.6 5.5 6.5-3.8.9-5.1 3.2-5.5 6.5-.4-3.3-1.7-5.6-5.5-6.5 3.8-.9 5.1-3.2 5.5-6.5z" />
  </Svg>
);
export const IconCube = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.75 13.75 5v6L8 14.25 2.25 11V5z" />
    <path d="M2.25 5 8 8.25 13.75 5M8 8.25v6" />
  </Svg>
);
export const IconSquare = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M5 10.5 7 8l1.5 1.5L11 6" />
  </Svg>
);
export const IconKeyboard = (p: P) => (
  <Svg {...p}>
    <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
    <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6" />
  </Svg>
);
export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />
  </Svg>
);
export const IconWave = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 8h1.5M4.5 5v6M7 3v10M9.5 6v4M12 4.5v7M14.5 8h0" />
  </Svg>
);
export const IconGrip = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="4" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="4" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="6" cy="8" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="8" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="6" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconSolo = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M9.8 6.2c-.3-.6-1-.9-1.8-.9-1 0-1.7.5-1.7 1.3 0 1.8 3.6 1 3.6 2.9 0 .8-.8 1.4-1.9 1.4-.9 0-1.6-.4-1.9-1" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
);
