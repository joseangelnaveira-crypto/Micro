import { test, expect } from '@playwright/test';

// Flujo completo: entrar, generar un examen de 2 preguntas, contestarlas y ver los resultados.
// Es la prueba que habría detectado el fallo de hooks al pulsar «Empezar examen».
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, 'Define E2E_EMAIL y E2E_PASSWORD en .env.local');

test('generar y terminar un examen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/login');
  await page.waitForLoadState('networkidle'); // espera a que React hidrate el formulario
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Contraseña', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Generar examen').first()).toBeVisible({ timeout: 60_000 });

  // 2 preguntas
  const num = page.locator('input[type="number"]').first();
  await num.fill('2');
  await page.getByRole('button', { name: 'Empezar examen' }).click();

  for (let i = 0; i < 2; i++) {
    await expect(page.getByText(`PREGUNTA ${i + 1} / 2`, { exact: false })).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('a');
    await expect(page.getByText(/Respuesta (correcta|incorrecta)/)).toBeVisible();
    await page.keyboard.press('Enter');
  }

  await expect(page.getByText('Nota de corte')).toBeVisible({ timeout: 60_000 });
  expect(errors, `Errores de página: ${errors.join(' | ')}`).toEqual([]);
});
