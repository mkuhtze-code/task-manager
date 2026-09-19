import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { logError } from '@/lib/logError';
import { maskEmail } from '@/lib/admin/privacy';

/** List feedback for the admin inbox — service-role, admin-gated, audited. */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const { data: items, error } = await supabaseAdmin
      .from('feedback')
      .select('id,submitter_email,message,is_anonymous,page_context,created_at,user_id')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const ids = (items || []).map((i) => i.id);
    let replies: {
      id: string;
      feedback_id: string;
      author_type: 'user' | 'admin';
      message: string;
      created_at: string;
    }[] = [];

    if (ids.length > 0) {
      const { data: replyRows, error: replyError } = await supabaseAdmin
        .from('feedback_replies')
        .select('id,feedback_id,author_type,message,created_at')
        .in('feedback_id', ids)
        .order('created_at', { ascending: true });
      if (replyError) throw replyError;
      replies = (replyRows || []) as typeof replies;
    }

    await writeAdminAudit({
      actorId: access.userId,
      action: 'feedback.list',
      metadata: { count: items?.length ?? 0 },
    });

    return NextResponse.json({
      items: (items || []).map((item) => ({
        id: item.id,
        // Full email only when not anonymous — inbox needs to reply by identity.
        // Anonymous rows never expose email.
        submitterEmail: item.is_anonymous ? null : item.submitter_email,
        submitterLabel: item.is_anonymous
          ? 'Anonymous'
          : maskEmail(item.submitter_email),
        message: item.message,
        isAnonymous: item.is_anonymous,
        pageContext: item.page_context,
        createdAt: item.created_at,
      })),
      replies,
    });
  } catch (error) {
    await logError('server', 'admin:feedback:list', error, {}, access.userId);
    return NextResponse.json({ error: 'Could not load feedback.' }, { status: 500 });
  }
}

/** Admin reply to a feedback thread. */
export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const feedbackId = typeof body?.feedbackId === 'string' ? body.feedbackId : null;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!feedbackId || !message) {
    return NextResponse.json({ error: 'Feedback id and message are required.' }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: 'Reply is too long.' }, { status: 400 });
  }

  try {
    const { data: feedback, error: fbError } = await supabaseAdmin
      .from('feedback')
      .select('id,is_anonymous')
      .eq('id', feedbackId)
      .maybeSingle();
    if (fbError) throw fbError;
    if (!feedback) {
      return NextResponse.json({ error: 'Feedback not found.' }, { status: 404 });
    }
    if (feedback.is_anonymous) {
      return NextResponse.json(
        { error: 'Anonymous feedback cannot receive a reply in-app.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('feedback_replies')
      .insert({
        feedback_id: feedbackId,
        author_type: 'admin',
        author_id: access.userId,
        message,
      })
      .select('id,feedback_id,author_type,message,created_at')
      .single();
    if (error) throw error;

    await writeAdminAudit({
      actorId: access.userId,
      action: 'feedback.reply',
      targetType: 'feedback',
      targetId: feedbackId,
      metadata: { replyId: data.id },
    });

    return NextResponse.json({ reply: data });
  } catch (error) {
    await logError('server', 'admin:feedback:reply', error, { feedbackId }, access.userId);
    return NextResponse.json({ error: 'Could not send reply.' }, { status: 500 });
  }
}
