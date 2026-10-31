# Pipeline de importación de exámenes OPE publicados

Herramientas usadas para construir los lotes "OPE ..." del banco de preguntas. No forman parte de la app;
sirven para repetir el proceso con exámenes nuevos. Requieren `pdftotext` (poppler), Python 3 con `pymupdf`
(+ `rapidocr-onnxruntime` solo para PDFs escaneados) y la `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.

Orden:
1. `pdftotext -layout -enc UTF-8 examen.pdf examen.txt` (si el PDF es escaneado: `ocr_pdf.py`, pero el OCR pierde
   tildes; mejor transcribir a mano o buscar otra fuente).
2. `parse_exam.py` / `parse2.py` (examen -> JSON con enunciado + 4 opciones) y `parse_cases.py` (casos clínicos SAS).
3. Plantilla de respuestas DEFINITIVA -> `assemble.py` (hay que transcribirla; las anuladas se descartan).
4. `filter.py` (quita legislación, estadística, casos sin contexto, anuladas) y `dedupe.py` (contra el banco: `export_bank.mjs`).
5. Revisión humana pregunta a pregunta (clave oficial vs. criterio propio; se descartan las dudosas/ambiguas).
6. `final.py` / `final_cases.py` generan un `.txt` por examen en el formato de `parse-questions.ts` y se suben con
   `npm run seed -- lote.txt`. Cada examen es su propio `source`; no se mezclan lotes.

En los casos clínicos, enunciado y pregunta van en una línea separada por ` ¶ ` y `parseQuestionsText` lo convierte
en una línea en blanco; la app lo pinta con `QuestionText`.
