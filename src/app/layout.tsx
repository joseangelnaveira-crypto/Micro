import type { Metadata } from 'next';
import { Instrument_Serif } from 'next/font/google';
import './globals.css';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['italic', 'normal'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Academia de Microbiología',
  description: 'Banco de preguntas y exámenes tipo test para preparación OPE',
  manifest: '/manifest.json',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport = {
  themeColor: '#241E3D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={instrumentSerif.variable}>
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
