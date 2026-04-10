"use client"

import { BabulfishProvider, TranslateButton } from "babulfish"
import "./globals.css"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">
        <BabulfishProvider
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
          <TranslateButton
            classNames={{ container: "fixed right-4 top-4 z-50" }}
          />
        </BabulfishProvider>
      </body>
    </html>
  )
}
