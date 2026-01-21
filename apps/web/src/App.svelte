<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { init, initData, isTMA, themeParams, viewport } from '@tma.js/sdk-svelte'
  import Welcome from './screens/Welcome.svelte'
  import Home from './screens/Home.svelte'
  import { apiAuthTelegram, type UserPublicDTO } from './lib/api'

  const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

  let envChecked = false
  let isMiniApp = false
  let screen: 'loading' | 'welcome' | 'home' = 'loading'
  let initialUser: UserPublicDTO | null = null

  onMount(async () => {
    if (DEV_MODE) {
      isMiniApp = true
      envChecked = true

      try {
        const res = await apiAuthTelegram('dev')
        initialUser = res.user
        screen = res.user.onboarding_done ? 'home' : 'welcome'
      } catch {
        screen = 'welcome'
      }
      return
    }

    try {
      isMiniApp = isTMA()
    } catch {
      isMiniApp = false
    }

    envChecked = true

    if (!isMiniApp) return

    init()

    try {
      if (!viewport.isMounted()) viewport.mount()
      viewport.expand()
    } catch {}

    try { initData.restore() } catch {}
    try { themeParams.mount() } catch {}
    try { themeParams.bindCssVars() } catch {}

    const rawData = initData.raw()
    if (rawData) {
      try {
        const res = await apiAuthTelegram(rawData)
        initialUser = res.user
        screen = res.user.onboarding_done ? 'home' : 'welcome'
      } catch {
        screen = 'welcome'
      }
    } else {
      screen = 'welcome'
    }
  })
</script>

{#if envChecked && !isMiniApp}
  <main class="gate">
    <div class="gate-card">
      <h1>Telegram Mini App</h1>
      <p>Откройте через @TGAuctionCloneBot</p>
      <a href="https://t.me/TGAuctionCloneBot">Открыть бота</a>
    </div>
  </main>
{:else if !envChecked || screen === 'loading'}
  <main class="loading">
    <div class="spinner"></div>
  </main>
{:else}
  {#key screen}
    <div in:fade={{ duration: 200, delay: 50 }} out:fade={{ duration: 100 }}>
      {#if screen === 'welcome'}
        <Welcome {initialUser} on:done={() => (screen = 'home')} />
      {:else}
        <Home {initialUser} />
      {/if}
    </div>
  {/key}
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
  }

  :global(html, body) {
    touch-action: manipulation;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    overscroll-behavior: none;
  }

  :global(body) {
    margin: 0;
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-text-color, #000);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  :global(input, button) {
    font-family: inherit;
    outline: none;
  }

  .gate {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #1c1c1e;
  }

  .gate-card {
    max-width: 320px;
    padding: 32px 24px;
    text-align: center;
    color: #fff;
    background: #2c2c2e;
    border-radius: 16px;
  }

  .gate-card h1 {
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 600;
  }

  .gate-card p {
    margin: 0 0 24px;
    font-size: 14px;
    opacity: 0.7;
  }

  .gate-card a {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 10px;
    text-decoration: none;
    color: #fff;
    background: #007aff;
    font-weight: 600;
    font-size: 15px;
  }

  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--tg-theme-bg-color, #fff);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.1));
    border-top-color: var(--tg-theme-button-color, #007aff);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
