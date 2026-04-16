import { ModelStatus } from "./model-status"

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section className="mb-8 rounded-[2rem] border border-gray-200 bg-white p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)]">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">
          babulfish React Demo
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-gray-950">
          React provider integration, visible lifecycle, restore, and RTL.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-700">
          This demo keeps the React boundary honest. The fixed globe button is the
          shipped stock UI, the control panel shows what the hooks expose today,
          and only the content block below is inside <code>dom.roots</code>.
        </p>
        <ul className="mt-6 grid gap-3 text-sm text-gray-600 md:grid-cols-3">
          <li className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <strong className="block text-gray-900">Provider</strong>
            <span>One <code>TranslatorProvider</code> scopes the page.</span>
          </li>
          <li className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <strong className="block text-gray-900">Hooks</strong>
            <span><code>useTranslator()</code> and <code>useTranslateDOM()</code> drive the status panel.</span>
          </li>
          <li className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <strong className="block text-gray-900">Root behavior</strong>
            <span>Arabic flips the translated root to RTL, and restore clears it.</span>
          </li>
        </ul>
      </section>

      <ModelStatus />

      <section
        data-demo-root
        className="mt-8 rounded-[2rem] border border-gray-200 bg-gray-50 p-8"
      >
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
              Translated Root
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-950">
              Only this container is inside <code>dom.roots</code>.
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-700">
              That keeps the lifecycle controls readable while the actual content
              below moves through original, translated, RTL, and restored states.
              babulfish, TranslateGemma, and WebGPU stay protected by the demo’s
              preserve matchers.
            </p>
            <p className="mt-4 text-base leading-7 text-gray-700">
              The current React boundary exposes model state, translation state,
              active language, raw capabilities, and page-level translate/restore
              actions. This demo shows that surface directly instead of inventing
              a wrapper layer.
            </p>
          </div>

          <aside className="rounded-3xl border border-gray-200 bg-white p-5 text-sm leading-7 text-gray-600">
            <p className="font-semibold uppercase tracking-[0.2em] text-gray-500">
              Try This
            </p>
            <ol className="mt-3 space-y-2">
              <li>1. Load the model from the panel or the globe button.</li>
              <li>2. Translate to Spanish to show the normal LTR flow.</li>
              <li>3. Translate to Arabic to watch the root switch to <code>dir=&quot;rtl&quot;</code>.</li>
              <li>4. Restore to return to the original copy and clear the direction.</li>
            </ol>
          </aside>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">
              Client-side translation, no server detour
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              babulfish runs entirely in the browser. No server round-trips, no
              API keys, and no text leaves the device while the page translates.
            </p>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">
              The stock React surface stays small
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              <code>TranslatorProvider</code> wires the core once, the fixed globe
              button proves the shipped stock UI, and the hook panel above proves
              the provider snapshot the current boundary actually exposes.
            </p>
          </section>
        </div>
      </section>
    </main>
  )
}
