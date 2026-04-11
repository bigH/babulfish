"use client"

import { useTranslator } from "babulfish"

export function ModelStatus() {
  const { model, translation, currentLanguage, isSupported } = useTranslator()

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Model Status (useTranslator hook)
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium text-gray-600">WebGPU</dt>
        <dd>{isSupported ? "Supported" : "Not available"}</dd>

        <dt className="font-medium text-gray-600">Model</dt>
        <dd>
          {model.status === "idle" && "Not loaded"}
          {model.status === "downloading" &&
            `Downloading (${Math.round(model.progress * 100)}%)`}
          {model.status === "ready" && "Ready"}
          {model.status === "error" && "Error"}
        </dd>

        <dt className="font-medium text-gray-600">Translation</dt>
        <dd>
          {translation.status === "idle" && "Idle"}
          {translation.status === "translating" &&
            `Translating (${Math.round(translation.progress * 100)}%)`}
        </dd>

        <dt className="font-medium text-gray-600">Language</dt>
        <dd>{currentLanguage ?? "Original"}</dd>
      </dl>
    </section>
  )
}
