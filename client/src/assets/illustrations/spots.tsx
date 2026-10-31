import { Calendar, CheckSeal, Envelope, PottedPlant, Spot } from "./parts";

const LINE = { strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

export function NoAppointments() {
  return (
    <Spot>
      <PottedPlant x={150} y={156} scale={0.52} />
      <Calendar x={46} y={78}>
        <g fill="var(--teal-soft)">
          {[12, 30, 48, 66].map((cx) =>
            [36, 54].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />)
          )}
        </g>
      </Calendar>
    </Spot>
  );
}

export function NoSlots() {
  return (
    <Spot>
      <circle cx="100" cy="88" r="42" fill="var(--white)" />
      <circle cx="100" cy="88" r="42" stroke="var(--maroon)" strokeWidth="6" fill="none" />
      <path d="M100 64 V88 L116 98" stroke="var(--teal)" strokeWidth="6" {...LINE} />
      <rect x="62" y="140" width="76" height="16" rx="4" fill="var(--marigold-mid)" />
      <path d="M76 148 H124" stroke="var(--amber-text)" strokeWidth="3" {...LINE} />
    </Spot>
  );
}

export function BookingConfirmed() {
  return (
    <Spot>
      <PottedPlant x={38} y={156} scale={0.46} />
      <Calendar x={58} y={70}>
        <path d="M14 38 H70 M14 54 H46" stroke="var(--teal-soft)" strokeWidth="6" {...LINE} />
      </Calendar>
      <CheckSeal x={140} y={134} r={20} />
    </Spot>
  );
}

export function LinkExpired() {
  return (
    <Spot>
      <Envelope x={46} y={82} />
      <g transform="translate(140 76)">
        <circle r="24" fill="var(--brick)" />
        <path d="M0 -12 V2 L10 8" stroke="var(--white)" strokeWidth="4" {...LINE} />
      </g>
      <path d="M46 152 H142" stroke="var(--marigold)" strokeWidth="4" strokeDasharray="10 8" {...LINE} />
    </Spot>
  );
}

export function VerifyEmail({ done = false }: { done?: boolean }) {
  return (
    <Spot>
      <g transform="translate(62 44)">
        <rect width="76" height="60" rx="4" fill="var(--white)" />
        <path d="M14 18 H62 M14 32 H50" stroke="var(--teal-mid)" strokeWidth="5" {...LINE} />
      </g>
      <path d="M48 92 L100 124 L152 92 V148 A6 6 0 0 1 146 154 H54 A6 6 0 0 1 48 148 Z" fill="var(--maroon)" />
      <path d="M56 148 L90 124 M144 148 L110 124" stroke="var(--brick)" strokeWidth="4" {...LINE} />
      {done && <CheckSeal x={150} y={70} r={20} />}
    </Spot>
  );
}

export function Privacy() {
  return (
    <Spot>
      <path d="M62 156 V86 A38 38 0 0 1 138 86 V156 Z" fill="var(--maroon)" />
      <path d="M72 156 V88 A28 28 0 0 1 128 88 V156 Z" fill="var(--brick)" />
      <circle cx="116" cy="112" r="5" fill="var(--marigold)" />
      <g transform="translate(150 110)">
        <path d="M-12 -8 V-18 A12 12 0 0 1 12 -18 V-8" stroke="var(--teal)" strokeWidth="5" {...LINE} />
        <rect x="-17" y="-9" width="34" height="27" rx="4" fill="var(--teal)" />
        <circle cy="3" r="4" fill="var(--white)" />
      </g>
    </Spot>
  );
}

export function StepChoose() {
  return (
    <Spot>
      <g transform="translate(58 64)">
        <rect width="84" height="84" rx="6" fill="var(--white)" />
        <circle cx="42" cy="30" r="14" fill="var(--skin-a)" />
        <path d="M28 30 C26 12 58 10 56 28 C48 20 36 20 28 30 Z" fill="var(--hair)" />
        <path d="M18 72 C18 54 30 48 42 48 C54 48 66 54 66 72 Z" fill="var(--teal)" />
      </g>
      <rect x="28" y="100" width="28" height="48" rx="5" fill="var(--marigold-mid)" />
      <rect x="144" y="100" width="28" height="48" rx="5" fill="var(--marigold-mid)" />
    </Spot>
  );
}

export function StepPick() {
  return (
    <Spot>
      <g>
        {[0, 1, 2].map((col) =>
          [0, 1, 2].map((row) => {
            const picked = col === 1 && row === 1;
            const taken = col === 2 && row === 0;
            return (
              <rect
                key={`${col}-${row}`}
                x={50 + col * 36}
                y={70 + row * 28}
                width="30"
                height="22"
                rx="4"
                fill={picked ? "var(--teal)" : taken ? "var(--taken-soft)" : "var(--white)"}
              />
            );
          })
        )}
      </g>
      <path d="M116 112 L116 148 L126 140 L134 156 L141 152 L133 137 L146 135 Z" fill="var(--maroon)" stroke="var(--white)" strokeWidth="2" strokeLinejoin="round" />
    </Spot>
  );
}

export function StepConfirm() {
  return (
    <Spot>
      <Envelope x={52} y={84} />
      <CheckSeal x={144} y={84} r={20} />
    </Spot>
  );
}

export function StepAttend() {
  return (
    <Spot>
      <g fill="var(--maroon)">
        <path d="M46 104 C46 94 60 92 62 102 L66 128 H100 V142 H58 C52 142 50 136 49 130 Z" />
        <path d="M154 104 C154 94 140 92 138 102 L134 128 H112 V142 H142 C148 142 150 136 151 130 Z" />
      </g>
      <path d="M58 142 L54 156 M92 142 L92 156 M142 142 L146 156 M118 142 L118 156" stroke="var(--hair)" strokeWidth="4" {...LINE} />
      <circle cx="102" cy="70" r="16" fill="var(--marigold)" />
    </Spot>
  );
}
