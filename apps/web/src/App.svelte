<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import { init, initData, isTMA, miniApp, themeParams, viewport } from '@tma.js/sdk-svelte'
  import Welcome from './screens/Welcome.svelte'
  import Home from './screens/Home.svelte'
  import { apiAuthTelegram, type UserPublicDTO } from './lib/api'

  const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

  let envChecked = false
  let isMiniApp = false
  let screen: 'loading' | 'welcome' | 'home' = 'loading'
  let initialUser: UserPublicDTO | null = null

  function applyTheme() {
    let isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    
    try {
      if (miniApp.isMounted()) isDark = miniApp.isDark()
    } catch {}
    
    document.documentElement.classList.toggle('dark', isDark)
  }

  onMount(async () => {
    if (DEV_MODE) {
      isMiniApp = true
      envChecked = true
      applyTheme()

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
    try { if (!miniApp.isMounted()) miniApp.mount() } catch {}

    applyTheme()

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
  :global(:root) {
    --ios-bg: #FFFFFF;
    --ios-bg-secondary: #F2F2F7;
    --ios-bg-tertiary: #FFFFFF;
    --ios-bg-grouped: #F2F2F7;
    --ios-bg-elevated: #FFFFFF;
    
    --ios-label: #000000;
    --ios-label-secondary: #3C3C43;
    --ios-label-tertiary: #3C3C4399;
    --ios-label-quaternary: #3C3C432E;
    
    --ios-separator: rgba(60, 60, 67, 0.29);
    --ios-separator-opaque: #C6C6C8;
    
    --ios-fill: rgba(120, 120, 128, 0.2);
    --ios-fill-secondary: rgba(120, 120, 128, 0.16);
    --ios-fill-tertiary: rgba(118, 118, 128, 0.12);
    
    --ios-blue: #007AFF;
    --ios-green: #34C759;
    --ios-red: #FF3B30;
    --ios-orange: #FF9500;
    --ios-yellow: #FFCC00;
    --ios-teal: #5AC8FA;
    --ios-purple: #AF52DE;
    
    --ios-gray: #8E8E93;
    --ios-gray2: #AEAEB2;
    --ios-gray3: #C7C7CC;
    --ios-gray4: #D1D1D6;
    --ios-gray5: #E5E5EA;
    --ios-gray6: #F2F2F7;
  }

  :global(:root.dark) {
    --ios-bg: #000000;
    --ios-bg-secondary: #1C1C1E;
    --ios-bg-tertiary: #2C2C2E;
    --ios-bg-grouped: #000000;
    --ios-bg-elevated: #1C1C1E;
    
    --ios-label: #FFFFFF;
    --ios-label-secondary: #EBEBF599;
    --ios-label-tertiary: #EBEBF54D;
    --ios-label-quaternary: #EBEBF52E;
    
    --ios-separator: rgba(84, 84, 88, 0.65);
    --ios-separator-opaque: #38383A;
    
    --ios-fill: rgba(120, 120, 128, 0.36);
    --ios-fill-secondary: rgba(120, 120, 128, 0.32);
    --ios-fill-tertiary: rgba(118, 118, 128, 0.24);
    
    --ios-blue: #0A84FF;
    --ios-green: #30D158;
    --ios-red: #FF453A;
    --ios-orange: #FF9F0A;
    --ios-yellow: #FFD60A;
    --ios-teal: #64D2FF;
    --ios-purple: #BF5AF2;
    
    --ios-gray: #8E8E93;
    --ios-gray2: #636366;
    --ios-gray3: #48484A;
    --ios-gray4: #3A3A3C;
    --ios-gray5: #2C2C2E;
    --ios-gray6: #1C1C1E;
  }

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
    overflow-x: hidden;
  }

  :global(html) {
    overflow-y: scroll;
  }

  :global(#app) {
    overflow-x: hidden;
    min-height: 100vh;
  }

  :global(body) {
    margin: 0;
    background: var(--ios-bg);
    color: var(--ios-label);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    transition: background 0.2s ease, color 0.2s ease;
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
    background: var(--ios-bg-secondary);
  }

  .gate-card {
    max-width: 320px;
    padding: 32px 24px;
    text-align: center;
    color: var(--ios-label);
    background: var(--ios-bg-tertiary);
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
    color: var(--ios-label-secondary);
  }

  .gate-card a {
    display: inline-block;
    padding: 12px 24px;
    border-radius: 10px;
    text-decoration: none;
    color: #fff;
    background: var(--ios-blue);
    font-weight: 600;
    font-size: 15px;
    transition: opacity 0.15s ease;
  }

  .gate-card a:active {
    opacity: 0.7;
  }

  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ios-bg);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--ios-fill);
    border-top-color: var(--ios-blue);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
