const ARCH_XS = [130, 240, 350, 460, 570];

/** Stands in until the real campus photo is added. A generic arcade, not a drawing of any building. */
export function CampusScene() {
  return (
    <svg
      viewBox="0 0 800 450"
      width="800"
      height="450"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="800" height="450" fill="var(--teal-soft)" />
      <circle cx="660" cy="88" r="38" fill="var(--marigold)" />
      <path d="M0 240 C80 170 170 190 220 240 Z" fill="var(--teal-mid)" />
      <path d="M560 240 C640 160 740 180 800 230 V240 Z" fill="var(--teal-mid)" />
      <rect x="84" y="170" width="632" height="210" fill="var(--maroon)" />
      <rect x="66" y="150" width="668" height="24" rx="3" fill="var(--maroon-deep)" />
      <rect x="84" y="196" width="632" height="6" fill="var(--brick)" />
      {ARCH_XS.map((x) => (
        <g key={x}>
          <path d={`M${x} 380 V284 A50 50 0 0 1 ${x + 100} 284 V380 Z`} fill="var(--brick)" />
          <path d={`M${x + 9} 380 V284 A41 41 0 0 1 ${x + 91} 284 V380 Z`} fill="var(--marigold-soft)" />
        </g>
      ))}
      <rect y="380" width="800" height="70" fill="var(--teal)" />
      <path d="M0 380 H800 V394 H0 Z" fill="var(--teal-mid)" />
      <circle cx="42" cy="326" r="52" fill="var(--teal)" />
      <rect x="37" y="340" width="10" height="48" fill="var(--hair)" />
      <circle cx="758" cy="316" r="60" fill="var(--teal)" />
      <rect x="753" y="340" width="10" height="48" fill="var(--hair)" />
    </svg>
  );
}
