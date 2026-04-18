type GlobalKey = "window" | "navigator" | "crossOriginIsolated"

type SavedGlobalDescriptor = {
  [K in GlobalKey]?: PropertyDescriptor
}

const GLOBAL_KEYS: readonly GlobalKey[] = [
  "window",
  "navigator",
  "crossOriginIsolated",
]

export function captureGlobalDescriptors(): SavedGlobalDescriptor {
  const saved: SavedGlobalDescriptor = {}
  for (const key of GLOBAL_KEYS) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key)
  }
  return saved
}

export function restoreGlobal(
  key: GlobalKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
    return
  }

  Reflect.deleteProperty(globalThis, key)
}

export function restoreGlobals(descriptors: SavedGlobalDescriptor): void {
  for (const key of GLOBAL_KEYS) {
    restoreGlobal(key, descriptors[key])
  }
}

export function setGlobal(key: GlobalKey, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
  })
}

export function clearGlobal(key: GlobalKey): void {
  Reflect.deleteProperty(globalThis, key)
}
