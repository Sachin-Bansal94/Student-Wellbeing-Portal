import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import {
  HeroScene,
  Privacy,
  StepAttend,
  StepChoose,
  StepConfirm,
  StepPick,
} from "../assets/illustrations";
import { CampusImage } from "../components/CampusImage";
import { CounsellorCard } from "../components/CounsellorCard";
import { SkeletonCard } from "../components/Feedback";
import { site } from "../siteConfig";
import type { Counsellor } from "../types";

export default function Home() {
  const { config } = useAuth();
  const { hash } = useLocation();
  const [counsellors, setCounsellors] = useState<Counsellor[] | null>(null);
  const [counsellorsFailed, setCounsellorsFailed] = useState(false);

  useEffect(() => {
    api
      .counsellors()
      .then((data) => setCounsellors(data.counsellors))
      .catch(() => setCounsellorsFailed(true));
  }, []);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  const slotMinutes = config?.slotMinutes ?? 20;
  const holdMinutes = config?.pendingExpiryMinutes ?? 10;
  const cutoffHours = config?.cancellationCutoffHours ?? 4;
  const horizonDays = config?.bookingHorizonDays ?? 14;
  const domain = config?.allowedDomain ?? "iitism.ac.in";

  const steps = [
    {
      title: "Choose a counsellor",
      body: "See who works at the Health Center and where to find them.",
      art: <StepChoose />,
    },
    {
      title: "Pick a slot",
      body: `Choose any open ${slotMinutes} minute time in the next ${horizonDays} days.`,
      art: <StepPick />,
    },
    {
      title: "Confirm from your email",
      body: `We hold the slot for ${holdMinutes} minutes and email you a link. Open it to confirm.`,
      art: <StepConfirm />,
    },
    {
      title: "Attend",
      body: "Come to the Health Center at your time. We remind you a day before and an hour before.",
      art: <StepAttend />,
    },
  ];

  const faqs = [
    {
      question: "Who can use this?",
      answer: `Students of ${site.institute.shortName} with an institute email ending in @${domain}.`,
    },
    {
      question: "What does it cost?",
      answer: `Nothing. Every ${slotMinutes} minute session is free.`,
    },
    {
      question: "Can I cancel?",
      answer: `Yes. Open My appointments and cancel up to ${cutoffHours} hours before your session. The slot then goes back to other students.`,
    },
    {
      question: "What if the confirm email does not arrive?",
      answer: `Check your spam folder first. Then open My appointments and choose Resend confirmation email. If the ${holdMinutes} minute hold runs out, the slot is released and you can book again.`,
    },
  ];

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Someone to talk to, right here on campus.</h1>
          <p className="hero-lead">
            Book a free {slotMinutes} minute session with a counsellor at the Health Center. Sessions
            are confidential, and you choose the time.
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/register">
              Register with your institute email
            </Link>
            <Link className="button ghost" to="/login">
              Sign in
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <HeroScene />
        </div>
      </section>

      <section className="home-section" id="how-it-works" aria-labelledby="how-heading">
        <div className="shell">
          <h2 id="how-heading">How it works</h2>
          <ol className="steps" role="list">
            {steps.map((step, index) => (
              <li key={step.title} className="step">
                {step.art}
                <div className="step-marker">
                  <span className="step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                </div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section on-white" id="counsellors" aria-labelledby="counsellors-heading">
        <div className="shell">
          <h2 id="counsellors-heading">The counsellors</h2>
          {counsellorsFailed ? (
            <p className="home-section-lead">
              We could not load the list just now. Sign in to see the counsellors and their times.
            </p>
          ) : (
            <div className="counsellor-grid home-counsellors">
              {counsellors === null
                ? [0, 1, 2].map((key) => <SkeletonCard key={key} lines={2} />)
                : counsellors.map((counsellor) => (
                    <CounsellorCard key={counsellor.id} counsellor={counsellor} heading="h3" />
                  ))}
            </div>
          )}
          <div className="home-prompt">
            <p>Sign in to see each counsellor&rsquo;s open times.</p>
            <Link className="button ghost" to="/login">
              Sign in to see times
            </Link>
          </div>
        </div>
      </section>

      <section className="home-section" id="privacy" aria-labelledby="privacy-heading">
        <div className="shell privacy-layout">
          <div>
            <h2 id="privacy-heading">What stays private</h2>
            <p className="home-section-lead">Here is exactly who can see what.</p>
            <Privacy />
          </div>
          <ul className="privacy-rows" role="list">
            <li>
              <h3>Your counsellor</h3>
              <p>Sees only your name, your email and any note you write for them.</p>
            </li>
            <li>
              <h3>Administrators</h3>
              <p>
                Never see your note. They can see your name, email, counsellor, date and time, so
                they can manage the schedule.
              </p>
            </li>
            <li>
              <h3>Other students</h3>
              <p>See only whether a time is free. The list of times never shows who booked.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="home-section on-white" id="questions" aria-labelledby="questions-heading">
        <div className="shell">
          <h2 id="questions-heading">Frequently asked questions</h2>
          <div className="faq">
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section help-section" id="help" aria-labelledby="help-heading">
        <div className="shell help-layout">
          <div>
            <h2 id="help-heading">Help right now</h2>
            <p className="home-section-lead">
              If things feel too heavy today, you do not have to wait for a slot. You can call any
              of these numbers.
            </p>
          </div>
          <ul className="help-list" role="list">
            {site.helplines.map((helpline) => (
              <li key={helpline.id} className="help-item">
                <h3>{helpline.name}</h3>
                <p>{helpline.description}</p>
                <div className="help-numbers">
                  {helpline.numbers.map((number) => (
                    <a key={number.tel} href={`tel:${number.tel}`}>
                      {number.display}
                    </a>
                  ))}
                </div>
              </li>
            ))}
            <li className="help-item">
              <h3>{site.healthCenter.name}</h3>
              <p>Contact the Health Center directly in an emergency on campus.</p>
              <div className="help-numbers is-quiet">
                {site.healthCenter.phones.map((phone) => (
                  <a key={phone.tel} href={`tel:${phone.tel}`}>
                    {phone.display}
                  </a>
                ))}
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="home-section on-white" aria-labelledby="final-heading">
        <div className="shell final-cta">
          <CampusImage />
          <div>
            <h2 id="final-heading">Take the first step when you are ready.</h2>
            <p>
              You only need your institute email. Registering takes a minute, and booking a session
              is up to you.
            </p>
            <Link className="button primary" to="/register">
              Register with your institute email
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
