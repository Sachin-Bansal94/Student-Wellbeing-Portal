import { Resend } from "resend";
import { env } from "../config/env";
import { buildIcs } from "../lib/ics";
import { formatIstDateTime, formatIstTimeRange } from "../lib/ist";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

type Attachment = { filename: string; content: string };

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
};

async function send({ to, subject, html, attachments }: SendArgs): Promise<void> {
  if (!resend) {
    console.log(`[email:dev] to=${to} subject="${subject}"`);
    return;
  }

  const { error } = await resend.emails.send({
    from: env.MAIL_FROM,
    to,
    subject,
    html,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
    })),
  });

  if (error) throw new Error(`Resend failed: ${error.message}`);
}

export type AppointmentEmailContext = {
  appointmentId: string;
  studentName: string;
  studentEmail: string;
  counsellorName: string;
  counsellorEmail: string | null;
  venue: string | null;
  room: string | null;
  startsAt: Date;
  endsAt: Date;
};

function layout(
  heading: string,
  bodyHtml: string,
  footer = "This appointment is confidential. If you did not request it, you can ignore this email."
): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2328">
    <div style="border-left:4px solid #7b1113;padding-left:14px;margin-bottom:24px">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7b1113;font-weight:600">IIT (ISM) Dhanbad Wellbeing</div>
      <h1 style="font-size:20px;margin:6px 0 0">${heading}</h1>
    </div>
    ${bodyHtml}
    <p style="font-size:12px;color:#6b7280;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
      ${footer}
    </p>
  </div>`;
}

const ACCOUNT_EMAIL_FOOTER = "If you did not request this, you can safely ignore this email.";

function detailsTable(ctx: AppointmentEmailContext): string {
  const location = [ctx.venue, ctx.room].filter(Boolean).join(" &middot; ");
  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:8px 0;color:#6b7280;width:110px">Counsellor</td><td style="padding:8px 0;font-weight:600">${ctx.counsellorName}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280">When</td><td style="padding:8px 0;font-weight:600">${formatIstDateTime(ctx.startsAt)}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280">Duration</td><td style="padding:8px 0">${formatIstTimeRange(ctx.startsAt, ctx.endsAt)}</td></tr>
    <tr><td style="padding:8px 0;color:#6b7280">Where</td><td style="padding:8px 0">${location || "Health Center, IIT (ISM) Dhanbad"}</td></tr>
  </table>`;
}

function icsFor(ctx: AppointmentEmailContext, cancelled = false): Attachment {
  return {
    filename: cancelled ? "cancelled.ics" : "appointment.ics",
    content: buildIcs({
      uid: `${ctx.appointmentId}@wellbeing.iitism.ac.in`,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: `Counselling session with ${ctx.counsellorName}`,
      description: `Confidential counselling appointment at the IIT (ISM) Dhanbad Health Center.`,
      location: [ctx.venue, ctx.room].filter(Boolean).join(", ") || "Health Center, IIT (ISM) Dhanbad",
      organizerEmail: ctx.counsellorEmail ?? "wellbeing@iitism.ac.in",
      attendeeEmail: ctx.studentEmail,
      cancelled,
    }),
  };
}

export async function sendConfirmationRequest(ctx: AppointmentEmailContext, token: string): Promise<void> {
  const link = `${env.CLIENT_ORIGIN}/confirm?token=${encodeURIComponent(token)}`;

  if (!resend) {
    console.log(`[email:dev] confirmation link for ${ctx.studentEmail}:\n${link}`);
  }

  await send({
    to: ctx.studentEmail,
    subject: `Confirm your counselling appointment - ${formatIstDateTime(ctx.startsAt)}`,
    html: layout(
      "One more step to confirm",
      `<p style="font-size:14px;line-height:1.6">Hi ${ctx.studentName.split(" ")[0]}, your slot is being held. Confirm it within ${env.PENDING_EXPIRY_MINUTES} minutes or it will be released to other students.</p>
       ${detailsTable(ctx)}
       <p style="margin:28px 0">
         <a href="${link}" style="background:#7b1113;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Confirm appointment</a>
       </p>
       <p style="font-size:12px;color:#6b7280">If the button does not work, paste this into your browser:<br>${link}</p>`
    ),
  });
}

export async function sendBookingConfirmed(ctx: AppointmentEmailContext): Promise<void> {
  await send({
    to: ctx.studentEmail,
    subject: `Appointment confirmed - ${formatIstDateTime(ctx.startsAt)}`,
    html: layout(
      "Your appointment is confirmed",
      `<p style="font-size:14px;line-height:1.6">You are booked in. We will remind you 24 hours and 1 hour before.</p>
       ${detailsTable(ctx)}
       <p style="font-size:13px;color:#6b7280;margin-top:24px">Need to cancel? You can do that from the portal up to ${env.CANCELLATION_CUTOFF_HOURS} hours before your slot.</p>`
    ),
    attachments: [icsFor(ctx)],
  });
}

export async function sendReminder(ctx: AppointmentEmailContext, kind: "reminder_24h" | "reminder_1h"): Promise<void> {
  const when = kind === "reminder_24h" ? "tomorrow" : "in about an hour";
  await send({
    to: ctx.studentEmail,
    subject: `Reminder: counselling appointment ${when}`,
    html: layout(
      `Your appointment is ${when}`,
      `<p style="font-size:14px;line-height:1.6">A quick reminder about your session.</p>
       ${detailsTable(ctx)}`
    ),
    attachments: kind === "reminder_24h" ? [icsFor(ctx)] : undefined,
  });
}

export async function sendCancellation(ctx: AppointmentEmailContext, cancelledByCounsellor: boolean): Promise<void> {
  await send({
    to: ctx.studentEmail,
    subject: `Appointment cancelled - ${formatIstDateTime(ctx.startsAt)}`,
    html: layout(
      "Appointment cancelled",
      `<p style="font-size:14px;line-height:1.6">${
        cancelledByCounsellor
          ? "Your counsellor had to cancel this session. You can book another slot whenever you are ready."
          : "This appointment has been cancelled as you requested."
      }</p>
       ${detailsTable(ctx)}`
    ),
    attachments: [icsFor(ctx, true)],
  });

  if (cancelledByCounsellor) return;

  if (ctx.counsellorEmail) {
    await send({
      to: ctx.counsellorEmail,
      subject: `Cancellation - ${formatIstDateTime(ctx.startsAt)}`,
      html: layout(
        "A student cancelled",
        `<p style="font-size:14px;line-height:1.6">The slot below is now free again.</p>
         ${detailsTable(ctx)}`
      ),
    });
  }
}

export async function sendCounsellorNotice(ctx: AppointmentEmailContext): Promise<void> {
  if (!ctx.counsellorEmail) return;
  await send({
    to: ctx.counsellorEmail,
    subject: `New booking - ${formatIstDateTime(ctx.startsAt)}`,
    html: layout(
      "New appointment booked",
      `<p style="font-size:14px;line-height:1.6">A student has confirmed a session with you.</p>
       ${detailsTable(ctx)}`
    ),
    attachments: [icsFor(ctx)],
  });
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = `${env.CLIENT_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;

  if (!resend) {
    console.log(`[email:dev] verification link for ${email}:\n${link}`);
  }

  await send({
    to: email,
    subject: "Verify your IIT (ISM) Wellbeing account",
    html: layout(
      "Welcome to Wellbeing Portal",
      `<p style="font-size:14px;line-height:1.6">Please verify your IIT (ISM) email address to
       activate your student account.</p>
       <p style="margin:28px 0">
         <a href="${link}" style="background:#7b1113;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Verify email</a>
       </p>
       <p style="font-size:12px;color:#6b7280">This link expires in ${env.EMAIL_VERIFICATION_EXPIRY_MINUTES} minutes. If the button does not work, paste this into your browser:<br>${link}</p>`,
      ACCOUNT_EMAIL_FOOTER
    ),
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${env.CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

  if (!resend) {
    console.log(`[email:dev] password reset link for ${email}:\n${link}`);
  }

  await send({
    to: email,
    subject: "Reset your Wellbeing Portal password",
    html: layout(
      "Reset your password",
      `<p style="font-size:14px;line-height:1.6">We received a request to reset the password on
       your account. If this was not you, you can safely ignore this email.</p>
       <p style="margin:28px 0">
         <a href="${link}" style="background:#7b1113;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Reset password</a>
       </p>
       <p style="font-size:12px;color:#6b7280">This link expires in ${env.PASSWORD_RESET_EXPIRY_MINUTES} minutes and can only be used once. If the button does not work, paste this into your browser:<br>${link}</p>`,
      ACCOUNT_EMAIL_FOOTER
    ),
  });
}
