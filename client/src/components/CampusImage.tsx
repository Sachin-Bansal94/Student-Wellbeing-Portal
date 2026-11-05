import { useState } from "react";
import { CampusScene } from "../assets/illustrations";
import { site } from "../siteConfig";

/** The campus photo once it is added, otherwise the illustration. Never a broken image icon. */
export function CampusImage() {
  const [photoLoaded, setPhotoLoaded] = useState(false);

  return (
    <div className="campus-frame">
      {!photoLoaded && <CampusScene />}
      <img
        src={site.assets.campusPhoto}
        alt={`The campus of ${site.institute.shortName}`}
        width="1600"
        height="900"
        loading="lazy"
        hidden={!photoLoaded}
        onLoad={() => setPhotoLoaded(true)}
        onError={() => setPhotoLoaded(false)}
      />
    </div>
  );
}
