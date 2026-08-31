import { createClient } from '@/lib/supabase/server';
import ApprovalList from './ApprovalList';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { IconShield } from '@/components/Icons';

export default async function AdminApprovalsPage() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at, status')
    .order('created_at', { ascending: true });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-secondary/10 text-secondary">
            <IconShield />
          </span>
          <CardTitle>Solicitudes de acceso</CardTitle>
        </div>
        <CardDescription>Aprueba o rechaza cada cuenta nueva antes de que pueda entrar a la aplicación.</CardDescription>
      </CardHeader>
      <CardContent>
        <ApprovalList profiles={pending ?? []} />
      </CardContent>
    </Card>
  );
}
