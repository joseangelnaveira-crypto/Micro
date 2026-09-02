import { savePushSubscription, deletePushSubscription } from '@/app/dashboard/push-actions';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function isPushSupported(): Promise<boolean> {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!(await isPushSupported())) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enableReminders(): Promise<{ ok: boolean; reason?: string }> {
  if (!(await isPushSupported())) return { ok: false, reason: 'Este navegador no admite notificaciones.' };

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: 'Recordatorios no configurados todavía.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'Has bloqueado los avisos del navegador.' };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await savePushSubscription(json);
  return { ok: true };
}

export async function disableReminders(): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await deletePushSubscription(endpoint);
}
