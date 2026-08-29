import { getAllUsersProgress } from '../actions';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default async function AdminUsersPage() {
  const users = await getAllUsersProgress();

  return (
    <div className="card">
      <h2>Progreso de usuarios</h2>
      <p className="hint">
        Visible solo para ti, como administrador. Los usuarios no pueden ver el progreso de nadie más.
      </p>

      {users.length === 0 ? (
        <p className="hint">Todavía no hay usuarios aprobados.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--dish-line)' }}>
                <th style={thStyle}>Usuario</th>
                <th style={thStyle}>Exámenes</th>
                <th style={thStyle}>Nota media</th>
                <th style={thStyle}>Mejor nota</th>
                <th style={thStyle}>Preguntas respondidas</th>
                <th style={thStyle}>Último examen</th>
                <th style={thStyle}>Registrado</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--dish-line)' }}>
                  <td style={tdStyle}>
                    <strong>{u.display_name || u.email}</strong>
                    <div style={{ fontSize: 11.5, color: 'var(--graphite)' }}>{u.email}</div>
                  </td>
                  <td style={tdStyle}>{u.totalExams}</td>
                  <td style={tdStyle}>{u.avgScore !== null ? `${u.avgScore}%` : '—'}</td>
                  <td style={tdStyle}>{u.bestScore !== null ? `${u.bestScore}%` : '—'}</td>
                  <td style={tdStyle}>{u.questionsAnswered}</td>
                  <td style={tdStyle}>{formatDate(u.lastExamAt)}</td>
                  <td style={tdStyle}>{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--graphite)' };
const tdStyle: React.CSSProperties = { padding: '10px 10px' };
