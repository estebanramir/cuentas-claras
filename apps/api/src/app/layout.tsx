/**
 * Esta app es solo API, pero necesita una raiz de App Router.
 *
 * Sin ella, Next cae al 404 del Pages Router, que arrastra styled-jsx y su
 * propia copia anidada de React. En este monorepo esa copia (19.2.8) no
 * coincide con la de la raiz (19.2.3, que fija el SDK de Expo) y el prerender
 * revienta con "Cannot read properties of null (reading 'useContext')".
 */
export const metadata = {
  title: 'Cuentas Claras · API',
  description: 'API de gastos compartidos y facturas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
