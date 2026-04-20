import type { ReactNode } from "react"
import { ModelStatus } from "./model-status"
import { DemoTranslatorShell } from "./demo-translator-shell"
import { resolveDemoRuntimeSelectionFromSearchParams } from "../../demo-shared/src/runtime-selection.js"

type DemoFact = {
  readonly title: string
  readonly body: ReactNode
}

type DemoStep = {
  readonly label: string
  readonly body: ReactNode
}

const OVERVIEW_FACTS: ReadonlyArray<DemoFact> = [
  {
    title: "Provider",
    body: (
      <>
        One <code>TranslatorProvider</code> scopes the page, and the runtime
        selector remounts it with a new config.
      </>
    ),
  },
  {
    title: "Hooks",
    body: (
      <>
        <code>useTranslator()</code> and <code>useTranslateDOM()</code> drive the
        status panel.
      </>
    ),
  },
  {
    title: "Root behavior",
    body: <>Arabic flips the translated root to RTL, and restore clears it.</>,
  },
]

const ROOT_NOTES: ReadonlyArray<ReactNode> = [
  <>
    That keeps the lifecycle controls readable while the actual content below
    moves through original, translated, RTL, and restored states. babulfish,
    TranslateGemma, and WebGPU stay protected by the demo&apos;s preserve
    matchers.
  </>,
  <>
    The current React boundary exposes model state, translation state, active
    language, raw capabilities, and page-level translate/restore actions. This
    demo shows that surface directly instead of inventing a wrapper layer.
  </>,
]

const TRY_THIS_STEPS: ReadonlyArray<DemoStep> = [
  {
    label: "1.",
    body: <>Load the model from the panel or the globe button.</>,
  },
  {
    label: "2.",
    body: <>Translate to Spanish to show the normal LTR flow.</>,
  },
  {
    label: "3.",
    body: (
      <>
        Translate to Arabic to watch the root switch to{" "}
        <code>dir=&quot;rtl&quot;</code>.
      </>
    ),
  },
  {
    label: "4.",
    body: <>Restore to return to the original copy and clear the direction.</>,
  },
]

const FEATURE_CARDS: ReadonlyArray<DemoFact> = [
  {
    title: "Client-side translation, no server detour",
    body: (
      <>
        babulfish runs entirely in the browser. No server round-trips, no API
        keys, and no text leaves the device while the page translates.
      </>
    ),
  },
  {
    title: "The stock React surface stays small",
    body: (
      <>
        <code>TranslatorProvider</code> wires the core once, the fixed globe
        button proves the shipped stock UI, and the hook panel above proves the
        provider snapshot the current boundary actually exposes.
      </>
    ),
  },
]

function createSearchParams(
  value: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const searchParams = new URLSearchParams()

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      searchParams.append(key, entry)
      continue
    }

    entry?.forEach((item) => {
      searchParams.append(key, item)
    })
  }

  return searchParams
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const initialRuntimeState = resolveDemoRuntimeSelectionFromSearchParams(
    createSearchParams(resolvedSearchParams),
  )

  return (
    <DemoTranslatorShell initialRuntimeState={initialRuntimeState}>
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
            shipped stock UI, the runtime strip chooses the exact provider config,
            the status panel reports what the hooks expose today, and only the
            content block below is inside <code>dom.roots</code>.
          </p>
          <ul className="mt-6 grid gap-3 text-sm text-gray-600 md:grid-cols-3">
            {OVERVIEW_FACTS.map(({ title, body }) => (
              <li
                key={title}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <strong className="block text-gray-900">{title}</strong>
                <span>{body}</span>
              </li>
            ))}
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
              {ROOT_NOTES.map((note, index) => (
                <p key={index} className="mt-4 text-base leading-7 text-gray-700">
                  {note}
                </p>
              ))}
            </div>

            <aside className="rounded-3xl border border-gray-200 bg-white p-5 text-sm leading-7 text-gray-600">
              <p className="font-semibold uppercase tracking-[0.2em] text-gray-500">
                Try This
              </p>
              <ol className="mt-3 space-y-2">
                {TRY_THIS_STEPS.map(({ label, body }) => (
                  <li key={label}>
                    {label} {body}
                  </li>
                ))}
              </ol>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {FEATURE_CARDS.map(({ title, body }) => (
              <section key={title} className="rounded-3xl bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-700">{body}</p>
              </section>
            ))}
          </div>
        </section>
      </main>
    </DemoTranslatorShell>
  )
}
