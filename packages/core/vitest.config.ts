import type { UserConfig } from "vitest/config"

export const vitestConfig = {
  test: {
    environment: "jsdom",
  },
} satisfies UserConfig

export default vitestConfig
