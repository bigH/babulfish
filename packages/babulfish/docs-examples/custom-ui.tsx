import {
  TranslatorProvider,
  useTranslator,
  type TranslatorLanguage,
} from "babulfish"

const languages: TranslatorLanguage[] = [
  { label: "English (Original)", code: "restore" },
  { label: "Spanish", code: "es-ES" },
  { label: "Japanese", code: "ja" },
]

function CustomTranslateUI() {
  const {
    currentLanguage,
    loadModel,
    model,
    restore,
    translateTo,
  } = useTranslator()

  if (model.status === "idle") {
    return <button onClick={() => void loadModel()}>Load translator</button>
  }

  if (model.status === "downloading") {
    return <p>Downloading model: {Math.round(model.progress * 100)}%</p>
  }

  return (
    <div>
      <select
        onChange={(event) => {
          const code = event.target.value

          if (code === "restore") {
            restore()
            return
          }

          void translateTo(code)
        }}
        value={currentLanguage ?? "restore"}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CustomUIExample() {
  return (
    <TranslatorProvider
      config={{ dom: { roots: ["#content"] }, languages }}
    >
      <CustomTranslateUI />
      <main id="content">
        <p>Translatable content here.</p>
      </main>
    </TranslatorProvider>
  )
}
