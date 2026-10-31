import { Mug, PottedPlant, SeatedPerson } from "./parts";

/** A student reading by a window, used beside the sign in forms. Decorative. */
export function AuthScene() {
  return (
    <svg viewBox="90 30 340 350" width="340" height="350" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="auth-opening">
          <path d="M30 380 V200 A170 170 0 0 1 370 200 V380 Z" transform="translate(60 0)" />
        </clipPath>
      </defs>
      <g clipPath="url(#auth-opening)">
        <rect x="90" y="30" width="340" height="350" fill="var(--teal-soft)" />
        <path d="M264 208 V116 A58 58 0 0 1 380 116 V208 Z" fill="var(--white)" />
        <circle cx="344" cy="118" r="20" fill="var(--marigold)" />
        <path d="M264 208 V176 C290 156 320 164 334 180 C350 164 368 166 380 176 V208 Z" fill="var(--teal-mid)" />
        <path d="M322 58 V208 M264 150 H380 M264 208 V116 A58 58 0 0 1 380 116 V208 Z" fill="none" stroke="var(--teal)" strokeWidth="5" />
        <rect x="90" y="330" width="340" height="50" fill="var(--marigold-soft)" />
        <rect x="90" y="324" width="340" height="7" fill="var(--white)" />
        <PottedPlant x={392} y={342} scale={0.68} />
        <SeatedPerson
          x={196}
          y={354}
          scale={0.68}
          skin="var(--skin-c)"
          top="var(--teal)"
          trousers="var(--maroon)"
          chair="var(--white)"
          hairStyle="long"
        >
          <path d="M52 -158 L106 -146 L102 -128 L48 -140 Z" fill="var(--marigold)" />
        </SeatedPerson>
        <rect x="296" y="288" width="60" height="9" rx="4" fill="var(--maroon)" />
        <path d="M326 296 V352" stroke="var(--hair)" strokeWidth="6" strokeLinecap="round" />
        <Mug x={326} y={288} scale={0.8} />
      </g>
    </svg>
  );
}
