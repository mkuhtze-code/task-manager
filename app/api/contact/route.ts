import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { logError } from '@/lib/logError';
import {
  sendEmail,
  isEmailConfigured,
  contactInbox,
  contactReceivedUser,
  contactNotifyTeam,
} from '@/lib/email';

const MAX_MESSAGE = 8000;
const MAX_SUBJECT = 120;

/**
 * POST /api/contact
 * Body: { message, subject?, name?, anonymous?, pageContext? }
 * Signed-in preferred; anonymous allowed when email provided in body.email
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const message =
    typeof body.message === 'string' ? body.message.trim() : '';
  const subjectLine =
    typeof body.subject === 'string' ? body.subject.trim().slice(0, MAX_SUBJECT) : 'General';
  const name =
    typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const anonymous = Boolean(body.anonymous);
  const pageContext =
    typeof body.pageContext === 'string'
      ? body.pageContext.trim().slice(0, 200)
      : null;
  const bodyEmail =
    typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';

  if (!message || message.length < 3) {
    return NextResponse.json(
      { error: 'Please include a short message.' },
      { status: 400 }
    );
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: 'Message is too long.' }, { status: 400 });
  }

  const auth = await verifyUser(req);
  let userId: string | null = null;
  let submitterEmail: string | null = null;

  if (auth.ok) {
    userId = auth.userId;
    submitterEmail = anonymous ? null : auth.email || null;
  } else if (!anonymous && bodyEmail && bodyEmail.includes('@')) {
    submitterEmail = bodyEmail;
  } else if (anonymous) {
    submitterEmail = null;
  } else {
    return NextResponse.json(
      { error: 'Sign in, or include an email so we can reply.' },
      { status: 401 }
    );
  }

  const composed = [
    subjectLine && subjectLine !== 'General' ? `Subject: ${subjectLine}` : null,
    name ? `Name: ${name}` : null,
    message,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const { data: row, error } = await supabaseAdmin
      .from('feedback')
      .insert({
        user_id: anonymous ? null : userId,
        submitter_email: submitterEmail,
        message: composed,
        is_anonymous: anonymous,
        page_context: pageContext,
      })
      .select('id')
      .single();

    if (error) throw error;

    // Emails are best-effort
    if (isEmailConfigured()) {
      const team = contactNotifyTeam({
        fromEmail: submitterEmail,
        fromName: name || null,
        subjectLine,
        message,
        userId: anonymous ? null : userId,
        pageContext,
        anonymous,
      });
      await sendEmail({
        to: contactInbox(),
        subject: team.subject,
        html: team.html,
        text: team.text,
        replyTo: submitterEmail || undefined,
        tags: [{ name: 'type', value: 'contact' }],
      });

      if (submitterEmail) {
        const ack = contactReceivedUser({
          name: name || null,
          messagePreview: message.slice(0, 120),
        });
        await sendEmail({
          to: submitterEmail,
          subject: ack.subject,
          html: ack.html,
          text: ack.text,
          tags: [{ name: 'type', value: 'contact_ack' }],
        });
      }
    }

    return NextResponse.json({ ok: true, id: row?.id });
  } catch (err) {
    await logError('server', 'contact:create', err, {}, userId || undefined);
    return NextResponse.json(
      { error: 'Could not send your message. Try again or email support@dokkit.space.' },
      { status: 500 }
    );
  }
}
