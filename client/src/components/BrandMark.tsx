import { useState } from "react";
import { site } from "../siteConfig";

/** Shows the official logo once the institute adds the file. Until then, a simple built in arch. */
export function BrandMark() {
  const [logoLoaded, setLogoLoaded] = useState(false);

  return (
    <span className="brand-mark" aria-hidden="true">
      {!logoLoaded && (
        <svg viewBox="0 0 64 64" width="44" height="44" focusable="false">
          <rect width="64" height="64" rx="8" fill="var(--maroon)" />
          <path d="M16 56 V30 a16 16 0 0 1 32 0 V56 Z" fill="var(--marigold-soft)" />
          <path d="M26 56 V36 a6 6 0 0 1 12 0 V56 Z" fill="var(--teal)" />
        </svg>
      )}
      <img
        src={site.assets.logo}
        alt=""
        width="44"
        height="44"
        hidden={!logoLoaded}
        onLoad={() => setLogoLoaded(true)}
        onError={() => setLogoLoaded(false)}
      />
    </span>
  );
}
