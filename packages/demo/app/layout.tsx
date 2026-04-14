"use client"

import { TranslatorProvider, TranslateButton } from "@babulfish/react"
import "./globals.css"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
        <TranslatorProvider
          config={{
            dom: {
              roots: ["main"],
              preserve: {
                matchers: ["babulfish", "Next.js", "TranslateGemma", "WebGPU"],
              },
            },
          }}
        >
          {children}
          <div className="fixed right-4 top-4 z-50">
            <TranslateButton />
          </div>
        </TranslatorProvider>
      </body>
    </html>
  )
}
