import { ModelStatus } from "./model-status"

const richTextExample = {
  boldText: "Bold text",
  italicText: "italic text",
  bodyText: "survive translation intact, along with",
  linkLabel: "inline links",
  linkHref: "https://example.com",
} as const

const richTextExampleMarkdown = `**${richTextExample.boldText}** and *${richTextExample.italicText}* ${richTextExample.bodyText} [${richTextExample.linkLabel}](${richTextExample.linkHref}).`

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">
        babulfish Demo
      </h1>

      <p className="mb-4 text-lg leading-relaxed text-gray-700">
        babulfish translates your entire page client-side using a small language
        model that runs directly in the browser. No server round-trips, no API
        keys, no data leaves the device. Click the globe icon in the top-right
        corner to try it.
      </p>

      <p className="mb-8 text-gray-600">
        Under the hood it loads TranslateGemma via WebGPU, walks the DOM to
        collect text nodes, batches them for efficient inference, and swaps in
        translations with smooth animations. The model is roughly 2.9 GB and
        cached in IndexedDB after the first download.
      </p>

      <h2 className="mb-4 text-xl font-semibold">Features</h2>
      <ul className="mb-8 list-inside list-disc space-y-2 text-gray-700">
        <li>Fully client-side translation — your text never leaves the browser</li>
        <li>14 languages out of the box, easily extensible</li>
        <li>Automatic RTL support for Arabic, Hebrew, Urdu, and Farsi</li>
        <li>Preserves brand names and technical terms during translation</li>
        <li>Rich text support — translates markdown content without breaking formatting</li>
        <li>Progress indicators and accessible ARIA live regions</li>
        <li>One-line React integration via TranslatorProvider</li>
      </ul>

      <h2 className="mb-4 text-xl font-semibold">How It Works</h2>
      <p className="mb-4 text-gray-700">
        Wrap your app in a TranslatorProvider, drop in a TranslateButton, and
        mark which DOM roots to translate. babulfish handles model loading,
        text extraction, batching, placeholder preservation, and DOM updates
        automatically. For custom UI, the useTranslator hook exposes the full
        model and translation state.
      </p>

      <p
        className="mb-8 rounded bg-gray-100 p-4 text-sm text-gray-600"
        data-md={richTextExampleMarkdown}
      >
        <strong>{richTextExample.boldText}</strong> and{" "}
        <em>{richTextExample.italicText}</em> {richTextExample.bodyText}{" "}
        <a href={richTextExample.linkHref} className="underline">
          {richTextExample.linkLabel}
        </a>
        .
      </p>

      <ModelStatus />
    </main>
  )
}
