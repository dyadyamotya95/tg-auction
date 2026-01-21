<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fly, scale } from 'svelte/transition'
  import { elasticOut } from 'svelte/easing'

  import Avatar from '../components/Avatar.svelte'
  import Switch from '../components/Switch.svelte'
  import { apiPatchMe, type UserPublicDTO } from '../lib/api'
  import { getInitData } from '../lib/init-data'
  import { triggerSelectionChanged, triggerHaptic, triggerSuccessPattern } from '../lib/haptic'

  export let initialUser: UserPublicDTO | null = null

  let user: UserPublicDTO | null = initialUser
  let isAnonymous = Boolean(initialUser?.is_anonymous)
  let error = ''
  let avatarTransitioning = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingAnonymous: boolean | null = null

  const dispatch = createEventDispatcher<{ done: void }>()

  $: displayName = isAnonymous ? (user?.anon_name || 'Anonymous') : (user?.public_name || 'User')

  function setAnonymous(next: boolean): void {
    if (!user) return

    triggerSelectionChanged()
    isAnonymous = next
    avatarTransitioning = true
    setTimeout(() => { avatarTransitioning = false }, 50)

    pendingAnonymous = next

    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      if (pendingAnonymous === null) return
      const valueToSend = pendingAnonymous
      pendingAnonymous = null
      debounceTimer = null

      const initDataRaw = getInitData()
      if (!initDataRaw) return

      apiPatchMe(initDataRaw, { is_anonymous: valueToSend })
        .then((updated) => { user = updated })
        .catch(() => {})
    }, 150)
  }

  function completeOnboarding(): void {
    if (!user) return
    triggerSuccessPattern()
    dispatch('done')

    const initDataRaw = getInitData()
    if (initDataRaw) {
      apiPatchMe(initDataRaw, { onboarding_done: true }).catch(() => {})
    }
  }
</script>

<main class="welcome">
  <div class="content">
    <div class="hero" in:scale={{ duration: 500, delay: 100, easing: elasticOut }}>
      <Avatar {user} {isAnonymous} size="xl" transitioning={avatarTransitioning} />
    </div>

    <h1 class="title" in:fly={{ y: 20, duration: 400, delay: 150 }}>
      Добро пожаловать
    </h1>

    <div class="name" class:transitioning={avatarTransitioning} in:fly={{ y: 20, duration: 400, delay: 200 }}>
      {displayName}
    </div>

    <div class="toggle-section" in:fly={{ y: 20, duration: 400, delay: 250 }}>
      <div class="toggle-card">
        <div class="toggle-info">
          <div class="toggle-label">Анонимный режим</div>
          <div class="toggle-hint">Другие участники не увидят ваш профиль</div>
        </div>
        <Switch
          checked={isAnonymous}
          disabled={!user}
          on:change={(e) => void setAnonymous(e.detail.checked)}
        />
      </div>
      <p class="note">Можно изменить позже в настройках</p>
    </div>

    {#if error}
      <div class="error" in:scale={{ duration: 200 }}>{error}</div>
    {/if}
  </div>

  <div class="bottom" in:fly={{ y: 30, duration: 400, delay: 300 }}>
    <button
      class="primary-btn"
      type="button"
      disabled={!user}
      on:click={() => completeOnboarding()}
    >
      Продолжить
    </button>
  </div>
</main>

<style>
  .welcome {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 24px 20px;
    background: var(--ios-bg);
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .hero {
    margin-bottom: 28px;
  }

  .title {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 400;
    color: var(--ios-gray);
    letter-spacing: -0.02em;
    text-align: center;
  }

  .name {
    font-size: 34px;
    font-weight: 700;
    color: var(--ios-label);
    margin-bottom: 40px;
    transition: opacity 200ms ease;
    letter-spacing: -0.5px;
  }

  .name.transitioning {
    opacity: 0;
  }

  .toggle-section {
    width: 100%;
    max-width: 360px;
  }

  .toggle-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--ios-bg-secondary);
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-label {
    font-size: 17px;
    font-weight: 400;
    color: var(--ios-label);
  }

  .toggle-hint {
    font-size: 13px;
    color: var(--ios-gray);
  }

  .note {
    margin: 12px 0 0;
    text-align: center;
    font-size: 13px;
    color: var(--ios-gray);
  }

  .error {
    width: 100%;
    max-width: 360px;
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(255, 69, 58, 0.12);
    color: var(--ios-red);
    font-size: 15px;
  }

  :global(:root:not(.dark)) .error {
    background: rgba(255, 59, 48, 0.12);
  }

  .bottom {
    padding-top: 20px;
  }

  .primary-btn {
    width: 100%;
    height: 50px;
    border: none;
    border-radius: 12px;
    font-size: 17px;
    font-weight: 600;
    color: #fff;
    background: var(--ios-blue);
    cursor: pointer;
    transition: opacity 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .primary-btn:active:not(:disabled) {
    opacity: 0.7;
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
