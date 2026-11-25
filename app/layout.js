import './globals.css';

export const metadata = {
  title: 'Cozinha Sem Fronteiras',
  description: 'Cardápio e pedidos do restaurante',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#730F10',
};

// Fontes por link do Google Fonts (next/font/google quebra o build no Turbopack)
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&family=Onest:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
