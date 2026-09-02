// Llamado por el cron de Vercel (ver vercel.json) una vez al día. Manda un recordatorio
// push a los usuarios aprobados que llevan varios días sin hacer un examen y tienen
// notificaciones activadas, sin repetirlo mientras sigan inactivos (cooldown).
//
// Protegido con CRON_SECRET: Vercel añade automáticamente la cabecera
// "Authorization: Bearer <CRON_SECRET>" en las llamadas de su propio cron cuando esa
// variable de entorno existe en el proyecto.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const INACTIVITY_DAYS = 3;
const REMINDER_COOLDOWN_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    return NextResponse.json({ error: 'Faltan variables de entorno de Supabase/VAPID' }, { status: 500 });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key');
  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ notified: 0, message: 'Sin suscripciones' });

  const userIds = [...new Set(subs.map(s => s.user_id))];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, status, created_at, last_reminder_sent_at')
    .in('id', userIds)
    .eq('status', 'approved');
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]));

  const lastActivityByUser = new Map<string, string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('exam_attempts')
      .select('user_id, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!lastActivityByUser.has(row.user_id)) lastActivityByUser.set(row.user_id, row.created_at);
    }
    if (data.length < PAGE) break;
  }

  const now = Date.now();
  const usersToNotify = userIds.filter(uid => {
    const profile = profileById.get(uid);
    if (!profile) return false;

    const lastActivity = lastActivityByUser.get(uid) ?? profile.created_at;
    const inactiveMs = now - new Date(lastActivity).getTime();
    if (inactiveMs < INACTIVITY_DAYS * DAY_MS) return false;

    if (profile.last_reminder_sent_at) {
      const sinceReminder = now - new Date(profile.last_reminder_sent_at).getTime();
      if (sinceReminder < REMINDER_COOLDOWN_DAYS * DAY_MS) return false;
    }
    return true;
  });

  let notified = 0;
  const staleEndpoints: string[] = [];

  for (const uid of usersToNotify) {
    const userSubs = subs.filter(s => s.user_id === uid);
    let sentOk = false;

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify({
            title: 'Academia de Microbiología',
            body: 'Llevas unos días sin repasar. Vuelve cuando puedas, tus preguntas te esperan.',
            url: '/dashboard',
          })
        );
        sentOk = true;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleEndpoints.push(sub.endpoint);
      }
    }

    if (sentOk) {
      notified++;
      await supabase.from('profiles').update({ last_reminder_sent_at: new Date().toISOString() }).eq('id', uid);
    }
  }

  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }

  return NextResponse.json({ notified, candidates: usersToNotify.length, staleRemoved: staleEndpoints.length });
}
