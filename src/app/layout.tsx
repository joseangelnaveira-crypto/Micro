import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Academia de Microbiología',
  description: 'Banco de preguntas y exámenes tipo test para preparación OPE',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#241E3D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
