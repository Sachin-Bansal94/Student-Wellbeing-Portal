import { ParsedMail, simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";

export type CapturedMail = ParsedMail & { receivedAt: number };

export type MailSink = {
  inbox: CapturedMail[];
  close: () => Promise<void>;
  waitFor: (predicate: (mail: CapturedMail) => boolean, timeoutMs?: number) => Promise<CapturedMail>;
  clear: () => void;
};

export async function startMailSink(): Promise<MailSink> {
  const inbox: CapturedMail[] = [];

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS", "AUTH"],
    onData(stream, _session, done) {
      simpleParser(stream)
        .then((mail) => {
          inbox.push(Object.assign(mail, { receivedAt: Date.now() }));
          done();
        })
        .catch((err) => done(err));
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.SMTP_PORT), "127.0.0.1", resolve);
  });

  return {
    inbox,
    clear: () => {
      inbox.length = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    waitFor: async (predicate, timeoutMs = 3000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = [...inbox].reverse().find(predicate);
        if (hit) return hit;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("Timed out waiting for an email");
    },
  };
}

export function recipients(mail: ParsedMail): string[] {
  const to = mail.to;
  if (!to) return [];
  const lists = Array.isArray(to) ? to : [to];
  return lists.flatMap((entry) => entry.value.map((v) => (v.address ?? "").toLowerCase()));
}

/** First link in the message whose path matches, e.g. "/confirm". */
export function linkWithPath(mail: ParsedMail, path: string): URL {
  const html = typeof mail.html === "string" ? mail.html : "";
  const match = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const hit = match.find((href) => new URL(href).pathname === path);
  if (!hit) throw new Error(`No ${path} link found in "${mail.subject}"`);
  return new URL(hit);
}

export function tokenFrom(mail: ParsedMail, path: string): string {
  const token = linkWithPath(mail, path).searchParams.get("token");
  if (!token) throw new Error(`Link in "${mail.subject}" has no token`);
  return token;
}
