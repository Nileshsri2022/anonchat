import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import '@fontsource-variable/inter';
import './globals.css'

export const metadata: Metadata = {
  title: 'AnonChat - Private Encrypted Messaging',
  description: 'Zero-storage, end-to-end encrypted messaging using Signal Protocol and Tor',
  applicationName: 'AnonChat',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon-512.png', type: 'image/png' }],
    apple: '/icon-512.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AnonChat',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ServiceWorkerRegistrar />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

