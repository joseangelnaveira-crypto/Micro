import { getAllUsersProgress } from '../actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { IconUsers } from '@/components/Icons';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default async function AdminUsersPage() {
  const users = await getAllUsersProgress();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-secondary/10 text-secondary">
            <IconUsers />
          </span>
          <CardTitle>Progreso de usuarios</CardTitle>
        </div>
        <CardDescription>
          Visible solo para ti, como administrador. Los usuarios no pueden ver el progreso de nadie más.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">Todavía no hay usuarios aprobados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Exámenes</TableHead>
                <TableHead>Nota media</TableHead>
                <TableHead>Mejor nota</TableHead>
                <TableHead>Preguntas respondidas</TableHead>
                <TableHead>Último examen</TableHead>
                <TableHead>Registrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="whitespace-normal">
                    <strong className="font-bold">{u.display_name || u.email}</strong>
                    <div className="text-[11.5px] text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>{u.totalExams}</TableCell>
                  <TableCell>{u.avgScore !== null ? `${u.avgScore}%` : '—'}</TableCell>
                  <TableCell>{u.bestScore !== null ? `${u.bestScore}%` : '—'}</TableCell>
                  <TableCell>{u.questionsAnswered}</TableCell>
                  <TableCell>{formatDate(u.lastExamAt)}</TableCell>
                  <TableCell>{formatDate(u.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
