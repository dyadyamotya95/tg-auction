<script lang="ts">
  import { onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { IconGavel, IconPlus, IconUser, IconGift, IconSnowflake, IconReceipt } from '@tabler/icons-svelte'

  import Avatar from '../components/Avatar.svelte'
  import Switch from '../components/Switch.svelte'
  import TransactionHistory from '../components/TransactionHistory.svelte'
  import AuctionList from './AuctionList.svelte'
  import CreateAuction from './CreateAuction.svelte'
  import AuctionDetail from './AuctionDetail.svelte'
  import { apiPatchMe, apiGetMyGifts, type UserPublicDTO, type GiftItemDTO } from '../lib/api'
  import { parseAuctionPhoto } from '../lib/auction-avatar'
  import { getInitData } from '../lib/init-data'
  import { walletStore, walletView } from '../lib/wallet-store'
  import { triggerSelectionChanged, triggerHaptic } from '../lib/haptic'

  export let initialUser: UserPublicDTO | null = null

  let user: UserPublicDTO | null = initialUser
  let isAnonymous = Boolean(initialUser?.is_anonymous)
  let tab: 'auctions' | 'profile' = 'auctions'
  let screen: 'main' | 'create' | 'detail' = 'main'
  let selectedAuctionId = ''
  let avatarTransitioning = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let pendingAnonymous: boolean | null = null
  let gifts: GiftItemDTO[] = []
  let giftsLoaded = false

  let displayBalance = 0
  let balanceAnimating = false
  let balancePressed = false
  const MAX_BALANCE = 100000
  const DEPOSIT_AMOUNT = 1000
  let lastAvailable: number | null = null

  onMount(async () => {
    await walletStore.refresh()
  })

  async function depositBalance() {
    if ($walletView.available >= MAX_BALANCE || balanceAnimating) return
    
    triggerHaptic('medium')
    balancePressed = true
    setTimeout(() => { balancePressed = false }, 150)

    try {
      await walletStore.deposit(DEPOSIT_AMOUNT)
    } catch {}
  }

  function animateBalance(from: number, to: number) {
    balanceAnimating = true
    const duration = 200
    const steps = 10
    const stepTime = duration / steps
    const increment = (to - from) / steps
    let current = from
    let step = 0

    const interval = setInterval(() => {
      step++
      current += increment
      displayBalance = Math.round(current)
      
      if (step >= steps) {
        clearInterval(interval)
        displayBalance = to
        balanceAnimating = false
      }
    }, stepTime)
  }

  function formatBalance(n: number): string {
    return n.toLocaleString('ru-RU')
  }

  $: {
    const next = Math.min($walletView.available, MAX_BALANCE)
    if (lastAvailable === null) {
      displayBalance = next
      lastAvailable = next
    } else if (next !== lastAvailable && !balanceAnimating) {
      animateBalance(displayBalance, next)
      lastAvailable = next
    }
  }

  $: displayName = !user ? '' : isAnonymous ? user.anon_name : user.public_name
  $: userId = user?.telegram_user_id || 0

  async function loadGifts(force = false) {
    if (!force && giftsLoaded) return
    const initData = getInitData()
    try {
      gifts = await apiGetMyGifts(initData)
      giftsLoaded = true
    } catch {}
  }

  $: if (tab === 'profile' && !giftsLoaded) {
    loadGifts()
  }

  function switchTab(newTab: typeof tab) {
    if (newTab === tab) return
    triggerSelectionChanged()
    tab = newTab
  }

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

  function onCreateAuction(): void {
    triggerHaptic('medium')
    screen = 'create'
  }

  function onSelectAuction(id: string): void {
    triggerHaptic('light')
    selectedAuctionId = id
    screen = 'detail'
  }

  async function onBack(): Promise<void> {
    screen = 'main'
    selectedAuctionId = ''
    try {
      await walletStore.refresh()

      // Если пользователь вернулся в профиль — обновим подарки,
      // чтобы выигранный подарок появился без перезагрузки приложения.
      if (tab === 'profile') {
        await loadGifts(true)
      }
    } catch {}
  }

  function onAuctionCreated(id: string): void {
    selectedAuctionId = id
    screen = 'detail'
  }
</script>

{#if screen === 'create'}
  <div in:fly={{ x: 300, duration: 300, easing: cubicOut }} out:fly={{ x: 300, duration: 200 }}>
    <CreateAuction on:back={onBack} on:created={(e) => onAuctionCreated(e.detail)} />
  </div>
{:else if screen === 'detail'}
  <div in:fly={{ x: 300, duration: 300, easing: cubicOut }} out:fly={{ x: 300, duration: 200 }}>
    <AuctionDetail auctionId={selectedAuctionId} {userId} on:back={onBack} />
  </div>
{:else}
  <main class="home">
    <header class="top">
      <h1 class="title">{tab === 'auctions' ? 'Аукционы' : 'Профиль'}</h1>
      <div class="header-right">
        {#if $walletView.hold > 0}
          <div class="hold-badge" in:fade={{ duration: 150 }}>
            <IconSnowflake size={14} />
            <span>{formatBalance($walletView.hold)}</span>
          </div>
        {/if}
        <button 
          class="balance-btn" 
          class:pressed={balancePressed}
          class:maxed={$walletView.available >= MAX_BALANCE}
          on:click={depositBalance}
        >
          <span class="star">⭐</span>
          <span class="balance-value">{formatBalance(displayBalance)}</span>
        </button>
      </div>
    </header>

    <section class="body">
      {#if tab === 'auctions'}
        <div in:fly={{ y: 20, duration: 250, delay: 50 }}>
          <AuctionList on:select={(e) => onSelectAuction(e.detail)} on:create={onCreateAuction} />
        </div>
      {:else if user}
        <div class="profile" in:fly={{ y: 20, duration: 250, delay: 50 }}>
          <div class="profile-header">
            <Avatar {user} {isAnonymous} size="md" transitioning={avatarTransitioning} />
            <div class="profile-name" class:transitioning={avatarTransitioning}>{displayName}</div>
          </div>

          <div class="settings-card">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Анонимный режим</span>
              </div>
              <Switch
                checked={isAnonymous}
                on:change={(e) => void setAnonymous(e.detail.checked)}
              />
            </div>
          </div>

          <div class="section">
            <div class="section-header">
              <span>Мои подарки</span>
              <span class="section-count">{gifts.length}</span>
            </div>
            
            {#if gifts.length === 0}
              <div class="empty-card">
                <IconGift size={32} stroke={1.5} />
                <span>Пока нет подарков</span>
              </div>
            {:else}
              <div class="gifts-list">
                {#each gifts as gift, idx}
                  {@const parsed = parseAuctionPhoto(gift.auction_photo)}
                  <button 
                    class="gift-item" 
                    on:click={() => onSelectAuction(gift.auction_id)}
                    style="animation-delay: {idx * 30}ms"
                  >
                    <div class="gift-icon" style="background: {parsed.gradientCss}">
                      <IconGift size={20} color="white" />
                    </div>
                    <div class="gift-info">
                      <span class="gift-name">{gift.gift_name}</span>
                      <span class="gift-number">#{gift.gift_number}</span>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <div class="section">
            <div class="section-header">
              <IconReceipt size={16} stroke={2} />
              <span>История</span>
            </div>
            <TransactionHistory />
          </div>
        </div>
      {/if}
    </section>

    {#if tab === 'auctions'}
      <button 
        class="fab" 
        type="button" 
        on:click={onCreateAuction}
        in:fly={{ y: 16, duration: 200 }}
        out:fade={{ duration: 100 }}
      >
        <IconPlus size={20} stroke={2.5} />
        <span>Создать</span>
      </button>
    {/if}

    <nav class="tabbar">
      <button 
        class="tab" 
        class:active={tab === 'auctions'} 
        on:click={() => switchTab('auctions')}
      >
        <IconGavel size={22} stroke={2} />
        <span>Аукционы</span>
      </button>
      <button 
        class="tab" 
        class:active={tab === 'profile'} 
        on:click={() => switchTab('profile')}
      >
        <IconUser size={22} stroke={2} />
        <span>Профиль</span>
      </button>
    </nav>
  </main>
{/if}

<style>
  .home {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--ios-bg);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    position: sticky;
    top: 0;
    background: var(--ios-bg);
    z-index: 10;
  }

  .title {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--ios-label);
    letter-spacing: -0.5px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hold-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--ios-fill-tertiary);
    color: var(--ios-gray);
    font-size: 13px;
    font-weight: 500;
  }

  .balance-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 12px;
    border: none;
    border-radius: 8px;
    background: var(--ios-fill-secondary);
    color: var(--ios-label);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .balance-btn:active,
  .balance-btn.pressed {
    background: var(--ios-fill);
    transform: scale(0.97);
  }

  .balance-btn.maxed {
    opacity: 0.5;
    pointer-events: none;
  }

  .star {
    font-size: 13px;
  }

  .balance-value {
    font-variant-numeric: tabular-nums;
  }

  .body {
    flex: 1;
    padding: 0 16px 100px;
  }

  .profile {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .profile-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 0;
  }

  .profile-name {
    font-size: 20px;
    font-weight: 600;
    color: var(--ios-label);
    transition: opacity 200ms ease;
  }

  .profile-name.transitioning {
    opacity: 0;
  }

  .settings-card {
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    overflow: hidden;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
  }

  .setting-label {
    font-size: 17px;
    color: var(--ios-label);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ios-gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px;
  }

  .section-count {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--ios-fill-tertiary);
    font-size: 12px;
    color: var(--ios-gray);
  }

  .empty-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 20px;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    color: var(--ios-gray);
    font-size: 15px;
  }

  .gifts-list {
    display: flex;
    flex-direction: column;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    overflow: hidden;
  }

  .gift-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    animation: fade-in 200ms ease backwards;
  }

  .gift-item:not(:last-child) {
    border-bottom: 0.5px solid var(--ios-separator);
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(8px); }
  }

  .gift-item:active {
    background: var(--ios-fill-tertiary);
  }

  .gift-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gift-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gift-name {
    font-size: 17px;
    font-weight: 400;
    color: var(--ios-label);
  }

  .gift-number {
    font-size: 15px;
    color: var(--ios-gray);
  }

  .fab {
    position: fixed;
    right: 16px;
    bottom: 90px;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ios-blue);
    color: #fff;
    cursor: pointer;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .fab span {
    display: none;
  }

  .fab:active {
    transform: scale(0.92);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    padding: 6px 0 calc(env(safe-area-inset-bottom, 0px) + 6px);
    background: rgba(var(--ios-bg), 0.72);
    background: color-mix(in srgb, var(--ios-bg) 72%, transparent);
    border-top: 0.5px solid var(--ios-separator);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
  }

  :global(:root:not(.dark)) .tabbar {
    background: rgba(249, 249, 249, 0.94);
  }

  :global(:root.dark) .tabbar {
    background: rgba(22, 22, 22, 0.9);
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border: none;
    background: transparent;
    color: var(--ios-gray);
    cursor: pointer;
    transition: color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .tab:active {
    opacity: 0.6;
  }

  .tab.active {
    color: var(--ios-blue);
  }

  .tab span {
    font-size: 10px;
    font-weight: 500;
  }
</style>
