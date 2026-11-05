import { Mug, PottedPlant, SeatedPerson } from "./parts";

const ARCH_OPENING = "M110 640 V322 A230 230 0 0 1 570 322 V640 Z";
const ARCH_RING = "M93 640 V322 A247 247 0 0 1 587 322 V640";

/**
 * A maroon wall with one tall arch, opening onto a bright room. The arch nods to the brick arcades
 * on campus: institutional on the outside, warm on the inside.
 */
export function HeroScene() {
  return (
    <svg
      viewBox="0 0 720 640"
      width="720"
      height="640"
      role="img"
      aria-label="A student and a counsellor talking in armchairs in a bright room, seen through a tall arch, with a small booking card beside them."
    >
      <defs>
        <clipPath id="hero-opening">
          <path d={ARCH_OPENING} />
        </clipPath>
      </defs>

      <path d={ARCH_RING} fill="none" stroke="var(--brick)" strokeWidth="22" strokeDasharray="31 5" />
      <path d="M322 54 H358 L352 96 H328 Z" fill="var(--marigold)" />

      <g clipPath="url(#hero-opening)">
        <rect x="110" y="80" width="460" height="560" fill="var(--teal-soft)" />

        <path d="M255 372 V244 A85 85 0 0 1 425 244 V372 Z" fill="var(--white)" />
        <circle cx="372" cy="240" r="30" fill="var(--marigold)" />
        <path d="M255 372 V318 C290 288 330 300 352 322 C378 296 404 300 425 316 V372 Z" fill="var(--teal-mid)" />
        <path
          d="M340 159 V372 M255 280 H425 M255 372 V244 A85 85 0 0 1 425 244 V372 Z"
          fill="none"
          stroke="var(--teal)"
          strokeWidth="7"
        />
        <rect x="240" y="370" width="200" height="11" rx="3" fill="var(--white)" />
        <PottedPlant x={278} y={371} scale={0.4} />

        <rect x="110" y="560" width="460" height="80" fill="var(--marigold-soft)" />
        <rect x="110" y="552" width="460" height="9" fill="var(--white)" />
        <path d="M262 561 H424 L482 640 H204 Z" fill="var(--marigold-mid)" />

        <path d="M340 482 V590" stroke="var(--hair)" strokeWidth="7" strokeLinecap="round" />
        <path d="M316 594 C326 588 354 588 364 594" stroke="var(--hair)" strokeWidth="7" strokeLinecap="round" fill="none" />
        <rect x="306" y="472" width="68" height="11" rx="5" fill="var(--maroon)" />
        <Mug x={330} y={472} scale={0.8} />
        <Mug x={354} y={472} scale={0.8} />

        <SeatedPerson
          x={214}
          y={590}
          scale={0.86}
          skin="var(--skin-b)"
          top="var(--marigold)"
          trousers="var(--teal)"
          chair="var(--white)"
          hairStyle="short"
        />
        <SeatedPerson
          x={466}
          y={590}
          scale={0.86}
          facing="left"
          skin="var(--skin-a)"
          top="var(--maroon)"
          trousers="var(--hair)"
          chair="var(--white)"
          hairStyle="bun"
        />
      </g>

      <g className="hero-card">
        <rect x="474" y="136" width="236" height="150" rx="10" fill="var(--maroon-deep)" opacity="0.55" transform="translate(0 7)" />
        <rect x="474" y="136" width="236" height="150" rx="10" fill="var(--white)" />
        <rect x="474" y="136" width="236" height="10" rx="5" fill="var(--teal)" />
        <text x="494" y="182" fontFamily="var(--font-heading)" fontSize="25" fontWeight="600" fill="var(--ink)">
          Thursday
        </text>
        <text x="494" y="213" fontFamily="var(--font-body)" fontSize="21" fill="var(--slate)">
          3:30 pm, 20 minutes
        </text>
        <rect x="494" y="232" width="122" height="34" rx="17" fill="var(--green-soft)" />
        <text x="555" y="255" textAnchor="middle" fontFamily="var(--font-body)" fontSize="19" fontWeight="600" fill="var(--green)">
          Confirmed
        </text>
      </g>
    </svg>
  );
}
