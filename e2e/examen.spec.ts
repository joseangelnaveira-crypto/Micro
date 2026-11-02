import { test, expect } from '@playwright/test';

// Flujo completo: entrar, generar un examen de 2 preguntas, contestarlas y ver los resultados.
// Es la prueba que habría detectado el fallo de hooks al pulsar «Empezar examen».
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, 'Define E2E_EMAIL y E2E_PASSWORD en .env.local');

// Rellena «Número de preguntas» esperando a que la pantalla de inicio termine de cargar
// (si no, React puede reponer el valor por defecto justo después de escribir).
async function setNumQuestions(page: import('@playwright/test').Page, n: number) {
  await page.waitForLoadState('networkidle');
  const num = page.locator('input[type="number"]').first();
  await expect(async () => {
    await num.fill(String(n));
    await expect(num).toHaveValue(String(n));
  }).toPass({ timeout: 20_000 });
}

test('generar y terminar un examen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/login');
  await page.waitForLoadState('networkidle'); // espera a que React hidrate el formulario
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Contraseña', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Generar examen').first()).toBeVisible({ timeout: 60_000 });

  await setNumQuestions(page, 2);
  await page.getByRole('button', { name: 'Empezar examen' }).click();

  for (let i = 0; i < 2; i++) {
    await expect(page.getByText(`PREGUNTA ${i + 1} / 2`, { exact: false })).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('a');
    await expect(page.getByText(/Respuesta (correcta|incorrecta)/)).toBeVisible();
    await page.keyboard.press('Enter');
  }

  await expect(page.getByText('Nota de corte')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Revisión del examen')).toBeVisible();
  expect(errors, `Errores de página: ${errors.join(' | ')}`).toEqual([]);

  // Desde el historial se puede volver a revisar ese examen.
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await page.getByText('Historial de exámenes').click();
  await page.getByRole('button', { name: 'Revisar' }).first().click();
  await expect(page.getByText('Revisión de examen')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Revisión del examen')).toBeVisible();
});

test('examen con corrección al final: saltar, volver y terminar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Contraseña', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Generar examen').first()).toBeVisible({ timeout: 60_000 });

  await setNumQuestions(page, 3);
  await page.getByText('Ajustes del examen').click();
  await page.getByLabel(/Corrección al final/).check();
  await page.getByRole('button', { name: 'Empezar examen' }).click();

  await expect(page.getByText('PREGUNTA 1 / 3')).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('a');                       // contesta la 1 (sin corrección)
  await expect(page.getByText(/Respuesta (correcta|incorrecta)/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Siguiente →' }).click();   // salta la 2
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('PREGUNTA 3 / 3')).toBeVisible();
  await page.getByRole('button', { name: '← Anterior' }).click();
  await expect(page.getByText('PREGUNTA 2 / 3')).toBeVisible();
  await page.keyboard.press('b');                       // contesta la 2 al volver
  await expect(page.getByText('CONTESTADAS 2')).toBeVisible();
  await page.getByRole('button', { name: 'Terminar', exact: true }).click();
  await page.getByRole('button', { name: 'Terminar' }).last().click(); // confirma (1 sin contestar)

  await expect(page.getByText('Nota de corte')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Revisión del examen')).toBeVisible();
  expect(errors, `Errores de página: ${errors.join(' | ')}`).toEqual([]);
});
