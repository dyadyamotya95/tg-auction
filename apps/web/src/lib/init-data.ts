import { initData } from '@tma.js/sdk-svelte'

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'
const DEV_INIT_DATA = 'dev'

export function getInitData(): string {
  if (DEV_MODE) {
    return DEV_INIT_DATA
  }
  try {
    return initData.raw() ?? ''
  } catch {
    return ''
  }
}
