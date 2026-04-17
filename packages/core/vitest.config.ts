import type { UserConfig } from "vitest/config"

export const vitestConfig: UserConfig = {
  test: {
    environment: "jsdom",
  },
}

export default vitestConfig
