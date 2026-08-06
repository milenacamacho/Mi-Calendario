export const metadata = {
  title: 'Mi Calendario',
  description: 'Aplicación de Calendario PWA',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
