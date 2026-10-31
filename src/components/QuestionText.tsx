import { cn } from '@/lib/utils';

// Las preguntas de casos clínicos guardan "enunciado del caso" + "pregunta" en el mismo texto,
// separados por una línea en blanco. El caso se muestra aparte (tipografía normal, en un bloque)
// y la pregunta destaca debajo. Si no hay separador, se pinta la pregunta tal cual.
export function splitCase(text: string): { caseText: string | null; question: string } {
  const i = text.indexOf('\n\n');
  if (i === -1) return { caseText: null, question: text };
  return { caseText: text.slice(0, i).trim(), question: text.slice(i + 2).trim() };
}

export default function QuestionText({
  text, className, caseClassName,
}: { text: string; className?: string; caseClassName?: string }) {
  const { caseText, question } = splitCase(text);
  if (!caseText) return <p className={className}>{question}</p>;
  return (
    <div>
      <div className={cn('mb-3 rounded-xl border border-border bg-muted/50 px-3.5 py-3 text-[14.5px] leading-relaxed text-foreground', caseClassName)}>
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[1px] text-muted-foreground">Caso clínico</span>
        {caseText}
      </div>
      <p className={className}>{question}</p>
    </div>
  );
}
