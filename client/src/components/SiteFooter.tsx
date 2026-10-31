import { Link } from "react-router-dom";
import { site } from "../siteConfig";

export function SiteFooter() {
  const { healthCenter, helplines, institute } = site;

  return (
    <footer className="site-footer on-maroon">
      <div className="shell">
        <div className="footer-lead">
          <p>Sessions are confidential. In an emergency, contact the Health Center directly.</p>
        </div>
      </div>

      <div className="shell footer-grid">
        <section className="footer-help" id="helplines" aria-labelledby="footer-helplines">
          <h2 id="footer-helplines">Help right now</h2>
          {helplines.map((helpline) => (
            <div key={helpline.id} className="footer-helpline">
              <strong>{helpline.name}</strong>
              <p>{helpline.description}</p>
              <div className="footer-numbers">
                {helpline.numbers.map((number) => (
                  <a key={number.tel} href={`tel:${number.tel}`}>
                    {number.display}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section aria-labelledby="footer-health-center">
          <h2 id="footer-health-center">{healthCenter.name}</h2>
          <ul className="footer-contact">
            {healthCenter.phones.map((phone) => (
              <li key={phone.tel}>
                <span>{phone.label}</span>
                <a href={`tel:${phone.tel}`}>{phone.display}</a>
              </li>
            ))}
            {healthCenter.email && (
              <li>
                <a href={`mailto:${healthCenter.email}`}>{healthCenter.email}</a>
              </li>
            )}
            {healthCenter.address && <li>{healthCenter.address}</li>}
            {healthCenter.openingHours && <li>{healthCenter.openingHours}</li>}
          </ul>
        </section>

        <nav aria-labelledby="footer-links">
          <h2 id="footer-links">Quick links</h2>
          <ul className="footer-links">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/appointments">My appointments</Link>
            </li>
            <li>
              <a href={healthCenter.url}>Health Center website</a>
            </li>
            <li>
              <a href={institute.url}>Institute website</a>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="footer-privacy">
          <h2 id="footer-privacy">Your privacy</h2>
          <p className="footer-note">
            Your note goes only to your counsellor. Administrators never see it, and other students
            never see who booked.
          </p>
        </section>
      </div>

      <div className="shell">
        <div className="footer-base">
          {site.productName}, {institute.shortName}
        </div>
      </div>
    </footer>
  );
}
