import type { ReactNode } from "react";

type PersonProps = {
  x: number;
  y: number;
  scale?: number;
  facing?: "left" | "right";
  skin: string;
  top: string;
  trousers: string;
  chair: string;
  hairStyle: "short" | "bun" | "long";
  children?: ReactNode;
};

/** A person seated in an armchair, drawn in profile. The origin is on the floor under the chair. */
export function SeatedPerson({
  x,
  y,
  scale = 1,
  facing = "right",
  skin,
  top,
  trousers,
  chair,
  hairStyle,
  children,
}: PersonProps) {
  const flip = facing === "left" ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale * flip} ${scale})`}>
      <path d="M-60 -62 L-68 0 M46 -62 L54 0" stroke="var(--hair)" strokeWidth="7" strokeLinecap="round" />
      <path
        d="M-92 -196 C-98 -206 -84 -214 -72 -212 C-58 -210 -52 -202 -50 -190 L-36 -96 L-74 -70 C-82 -110 -88 -160 -92 -196 Z"
        fill={chair}
      />
      <rect x="-78" y="-98" width="142" height="40" rx="16" fill={chair} />

      <path d="M-30 -116 L60 -112" stroke={trousers} strokeWidth="40" strokeLinecap="round" />
      <path d="M60 -112 L68 -20" stroke={trousers} strokeWidth="27" strokeLinecap="round" />
      <path d="M56 -16 L80 -16 C96 -15 104 -8 104 0 L56 0 Z" fill="var(--hair)" />

      <rect x="-13" y="-240" width="24" height="34" rx="10" fill={skin} />
      <path
        d="M-54 -96 C-60 -150 -50 -204 -18 -218 C4 -226 28 -216 30 -190 L30 -96 Z"
        fill={top}
      />

      <ellipse cx="4" cy="-264" rx="27" ry="31" fill={skin} />
      {hairStyle === "short" && (
        <path
          d="M-24 -252 C-34 -282 -18 -302 8 -300 C26 -299 36 -288 32 -278 C16 -284 2 -282 -6 -272 C-8 -258 -14 -246 -24 -252 Z"
          fill="var(--hair)"
        />
      )}
      {hairStyle === "bun" && (
        <>
          <circle cx="-30" cy="-284" r="15" fill="var(--hair)" />
          <path
            d="M-24 -246 C-36 -276 -20 -302 8 -300 C26 -299 36 -288 32 -278 C14 -282 0 -280 -8 -268 C-10 -256 -16 -242 -24 -246 Z"
            fill="var(--hair)"
          />
        </>
      )}
      {hairStyle === "long" && (
        <path
          d="M-30 -190 C-44 -240 -34 -300 6 -300 C26 -300 36 -288 32 -278 C14 -282 2 -278 -4 -266 C-6 -240 -10 -210 -14 -190 C-20 -184 -26 -184 -30 -190 Z"
          fill="var(--hair)"
        />
      )}

      {children}

      <path
        d="M-8 -194 C-2 -168 8 -150 22 -140 L58 -136"
        stroke={top}
        strokeWidth="23"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M-8 -194 C-2 -168 8 -150 22 -140 L58 -136" stroke="var(--ink)" strokeOpacity="0.1" strokeWidth="23" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="74" cy="-135" r="11.5" fill={skin} />
    </g>
  );
}

export function PottedPlant({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 -44 C-34 -70 -38 -112 -30 -132 C-10 -116 2 -84 0 -44 Z" fill="var(--teal)" />
      <path d="M0 -44 C30 -66 40 -96 36 -122 C12 -108 -2 -82 0 -44 Z" fill="var(--teal-mid)" />
      <path d="M0 -44 C-8 -80 -2 -128 10 -148 C22 -120 16 -78 0 -44 Z" fill="var(--teal)" />
      <path d="M-24 -46 H24 L18 0 H-18 Z" fill="var(--maroon)" />
      <rect x="-27" y="-50" width="54" height="9" rx="2" fill="var(--brick)" />
    </g>
  );
}

export function Mug({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M13 -18 C24 -19 24 -6 12 -6" stroke="var(--white)" strokeWidth="3.5" fill="none" />
      <path d="M-13 -24 H15 V-6 C15 -2 12 0 8 0 H-6 C-10 0 -13 -2 -13 -6 Z" fill="var(--white)" />
    </g>
  );
}

const SPOT_ARCH = "M36 160 V84 A64 64 0 0 1 164 84 V160 Z";

/**
 * Every small illustration stands in the same arch, on the same 200 by 160 grid, so the set reads as
 * one family. They are decorative: the text beside each one says what it means.
 */
export function Spot({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={`spot ${className}`}
      viewBox="0 0 200 160"
      width="200"
      height="160"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SPOT_ARCH} fill="var(--teal-soft)" />
      <rect x="18" y="156" width="164" height="4" rx="2" fill="var(--teal)" />
      {children}
    </svg>
  );
}

export function Calendar({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="84" height="76" rx="6" fill="var(--white)" />
      <path d="M0 22 V6 A6 6 0 0 1 6 0 H78 A6 6 0 0 1 84 6 V22 Z" fill="var(--maroon)" />
      <rect x="18" y="-6" width="6" height="14" rx="3" fill="var(--ink)" />
      <rect x="60" y="-6" width="6" height="14" rx="3" fill="var(--ink)" />
      {children}
    </g>
  );
}

export function Envelope({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="96" height="66" rx="6" fill="var(--white)" />
      <path d="M2 4 L48 38 L94 4" stroke="var(--maroon)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      {children}
    </g>
  );
}

export function CheckSeal({ x, y, r = 16 }: { x: number; y: number; r?: number }) {
  const k = r / 16;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <circle r="16" fill="var(--teal)" />
      <path d="M-7 0 L-2 6 L8 -6" stroke="var(--white)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}
