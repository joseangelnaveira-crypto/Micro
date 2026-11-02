import { test } from '@playwright/test';

// No es una prueba: genera capturas de la app (móvil y escritorio) en e2e-capturas/ para revisar el diseño.
// Ejecutar con: npm run e2e -- capturas
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
test.skip(!email || !password, 'Define E2E_EMAIL y E2E_PASSWORD en .env.local');

for (const [name, size] of [['movil', { width: 390, height: 844 }], ['escritorio', { width: 1280, height: 900 }]] as const) {
  test(`capturas ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contraseña', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByText('Generar examen').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `e2e-capturas/${name}-inicio.png`, fullPage: true });

    await page.locator('input[type="number"]').first().fill('3');
    await page.getByRole('button', { name: 'Empezar examen' }).click();
    await page.getByText('PREGUNTA 1 / 3').waitFor({ timeout: 60_000 });
    await page.screenshot({ path: `e2e-capturas/${name}-examen.png` });
    await page.keyboard.press('b');
    await page.getByText(/Respuesta (correcta|incorrecta)/).waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `e2e-capturas/${name}-examen-respondida.png`, fullPage: true });
    await page.keyboard.press('Enter');
    for (let i = 1; i < 3; i++) {
      await page.getByText(`PREGUNTA ${i + 1} / 3`).waitFor();
      await page.keyboard.press('a');
      await page.getByText(/Respuesta (correcta|incorrecta)/).waitFor();
      await page.keyboard.press('Enter');
    }
    await page.getByText('Revisión del examen').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `e2e-capturas/${name}-resultados.png`, fullPage: true });
  });
}
