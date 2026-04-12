import { TranslateButton, TranslatorProvider } from "babulfish"

export function QuickStartExample() {
  return (
    <TranslatorProvider config={{ dom: { roots: ["#content"] } }}>
      <main id="content">
        <h1>Hello, world</h1>
        <p>This text can be translated client-side.</p>
      </main>
      <TranslateButton />
    </TranslatorProvider>
  )
}
