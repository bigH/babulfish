import type { PropsWithChildren } from "react"
import "./globals.css"
import { DemoTranslatorShell } from "./demo-translator-shell"

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
        <DemoTranslatorShell>{children}</DemoTranslatorShell>
      </body>
    </html>
  )
}
