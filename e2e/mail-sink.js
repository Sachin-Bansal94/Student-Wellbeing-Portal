// Tiny development mail server. Collects everything the API sends so the walkthrough can read it.
//   SMTP in:  127.0.0.1:2527   (point the API at it with SMTP_HOST=127.0.0.1 SMTP_PORT=2527)
//   HTTP out: 127.0.0.1:2528   GET /?to=someone@iitism.ac.in   GET /clear
const path = require("path");
const serverModules = path.join(__dirname, "..", "server", "node_modules");
const { SMTPServer } = require(require.resolve("smtp-server", { paths: [serverModules] }));
const { simpleParser } = require(require.resolve("mailparser", { paths: [serverModules] }));
const http = require("http");

const inbox = [];

new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS", "AUTH"],
  onData(stream, _session, done) {
    simpleParser(stream)
      .then((mail) => {
        const to = (Array.isArray(mail.to) ? mail.to : [mail.to])
          .filter(Boolean)
          .flatMap((entry) => entry.value.map((v) => v.address.toLowerCase()));
        const html = typeof mail.html === "string" ? mail.html : "";
        const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
        inbox.push({
          at: Date.now(),
          to,
          subject: mail.subject,
          links,
          html,
          attachments: (mail.attachments || []).map((a) => a.filename),
        });
        done();
      })
      .catch(done);
  },
}).listen(2527, "127.0.0.1");

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/clear") inbox.length = 0;
    const to = url.searchParams.get("to");
    const out = to ? inbox.filter((m) => m.to.includes(to.toLowerCase())) : inbox;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(out));
  })
  .listen(2528, "127.0.0.1");

console.log("mail sink ready: SMTP 2527, HTTP 2528");
