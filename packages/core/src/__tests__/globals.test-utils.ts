type GlobalKey = "window" | "navigator"

type SavedGlobalDescriptor = {
  window?: PropertyDescriptor
  navigator?: PropertyDescriptor
}

export function captureGlobalDescriptors(): SavedGlobalDescriptor {
  return {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  }
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
  restoreGlobal("window", descriptors.window)
  restoreGlobal("navigator", descriptors.navigator)
}

export function setGlobal(key: GlobalKey, value: object): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
  })
}

export function clearGlobal(key: GlobalKey): void {
  Reflect.deleteProperty(globalThis, key)
}
