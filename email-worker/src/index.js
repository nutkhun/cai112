// Email Worker: receives mail addressed to the bu-sms.site routing address
// (directly, or forwarded from nattadej_p@bu.ac.th) and stores it in D1 so it
// shows up in the teacher dashboard's Email tab.
import PostalMime from 'postal-mime';

// A forwarded message often arrives "From" the forwarding mailbox with the
// original sender buried in headers or the body. Try the useful places.
function bestSender(parsed, message) {
  const headerFrom = (parsed.from && parsed.from.address) || message.from || '';
  // Outlook/Gmail forwards keep the original author here:
  const replyTo = parsed.replyTo && parsed.replyTo[0] && parsed.replyTo[0].address;
  if (replyTo) return replyTo;
  // "Fwd:" bodies usually start with "From: Some One <student@bumail.net>"
  const text = parsed.text || '';
  const m = text.match(/From:[^\n<]*<([^>\s]+@[^>\s]+)>/i) || text.match(/From:\s*([^\s<]+@[^\s>]+)/i);
  if (/^(fwd|fw):/i.test(parsed.subject || '') && m) return m[1];
  return headerFrom;
}

export default {
  async email(message, env) {
    let subject = '(no subject)';
    let body = '';
    let sender = message.from || '';
    try {
      const parsed = await new PostalMime().parse(message.raw);
      subject = parsed.subject || subject;
      body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
      sender = bestSender(parsed, message) || sender;
    } catch (err) {
      body = '(could not parse message body)';
    }

    const student = await env.DB.prepare(
      'SELECT id FROM students WHERE LOWER(email) = LOWER(?)'
    ).bind(sender).first();

    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO emails (id, direction, from_addr, to_addr, subject, body, student_id, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
    ).bind(
      id,
      'in',
      sender,
      message.to || '',
      subject.replace(/^(fwd|fw):\s*/i, ''),
      body.slice(0, 50000),
      student ? student.id : null
    ).run();

    // Announce the insert on the app's change feed so open dashboards see the
    // new email within seconds instead of waiting for a manual refresh.
    await env.DB.prepare(
      "INSERT INTO _changes (tbl, op, row_id) VALUES ('emails', 'INSERT', ?)"
    ).bind(id).run();
  },
};
