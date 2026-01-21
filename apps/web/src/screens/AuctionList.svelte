<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { IconGavel, IconGift } from '@tabler/icons-svelte'
  import type { AuctionListItemDTO } from '@tac/shared'
  import { apiGetAuctions } from '../lib/api'
  import { getInitData } from '../lib/init-data'
  import { createEventDispatcher } from 'svelte'
  import { parseAuctionPhoto } from '../lib/auction-avatar'
  import { triggerHaptic, triggerSelectionChanged } from '../lib/haptic'

  const dispatch = createEventDispatcher<{ select: string; create: void }>()

  let auctions: AuctionListItemDTO[] = []
  let loading = true
  let filter: 'all' | 'active' | 'completed' = 'all'
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function load(silent = false) {
    if (!silent) {
      loading = true
    }

    const initData = getInitData()
    const status = filter === 'all' ? undefined : filter
    auctions = await apiGetAuctions(initData, status)
    if (!silent) {
      loading = false
    }
  }

  onMount(() => {
    load()
    pollTimer = setInterval(() => load(true), 1000)
  })

  onDestroy(() => {
    if (pollTimer) {
      clearInterval(pollTimer)
    }
  })

  function setFilter(f: typeof filter) {
    if (f === filter) return
    triggerSelectionChanged()
    filter = f
    load(false)
  }

  function formatBid(amount: string): string {
    const n = parseFloat(amount)
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return amount
  }

  function getGradient(photoId: string): string {
    return parseAuctionPhoto(photoId).gradientCss
  }

  function handleSelect(id: string) {
    triggerHaptic('light')
    dispatch('select', id)
  }

  function handleCreate() {
    triggerHaptic('medium')
    dispatch('create')
  }
</script>

<div class="auction-list">
  <div class="filters">
    <button class="filter-btn" class:active={filter === 'all'} on:click={() => setFilter('all')}>
      Все
    </button>
    <button class="filter-btn" class:active={filter === 'active'} on:click={() => setFilter('active')}>
      Активные
    </button>
    <button class="filter-btn" class:active={filter === 'completed'} on:click={() => setFilter('completed')}>
      Завершённые
    </button>
  </div>

  {#if loading}
    <div class="loading">
      {#each [1, 2, 3] as i}
        <div class="skeleton-item" style="animation-delay: {i * 80}ms">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-content">
            <div class="skeleton-title"></div>
            <div class="skeleton-meta"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if auctions.length === 0}
    <div class="empty">
      <IconGavel size={40} stroke={1.5} />
      <p class="empty-title">Нет аукционов</p>
      <p class="empty-text">Создайте первый аукцион</p>
      <button class="empty-btn" on:click={handleCreate}>
        Создать
      </button>
    </div>
  {:else}
    <div class="list">
      {#each auctions as auction, idx}
        <button 
          class="auction-item" 
          on:click={() => handleSelect(auction.id)}
          in:fly={{ y: 20, duration: 250, delay: idx * 40, easing: cubicOut }}
        >
          <div class="auction-avatar" style="background: {getGradient(auction.auction_photo)}">
            <IconGavel size={24} stroke={1.5} color="white" />
          </div>
          
          <div class="auction-content">
            <div class="auction-top">
              <span class="auction-name">{auction.auction_name}</span>
              {#if auction.status === 'active'}
                <span class="live-badge">LIVE</span>
              {/if}
            </div>
            <div class="auction-meta">
              <span>{auction.distributed_items}/{auction.total_items} подарков</span>
              <span class="dot">·</span>
              <span>Раунд {auction.current_round}/{auction.total_rounds}</span>
            </div>
          </div>
          
          {#if auction.status === 'active' && parseFloat(auction.highest_bid) > 0}
            <div class="auction-bid">
              <span class="star">⭐</span>
              <span>{formatBid(auction.highest_bid)}</span>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .auction-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .filters {
    display: flex;
    padding: 2px;
    background: var(--ios-fill-tertiary);
    border-radius: 9px;
  }

  .filter-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--ios-gray);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .filter-btn.active {
    background: var(--ios-bg-elevated);
    color: var(--ios-label);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  :global(:root.dark) .filter-btn.active {
    background: var(--ios-gray4);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .loading {
    display: flex;
    flex-direction: column;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    overflow: hidden;
  }

  .skeleton-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .skeleton-item:not(:last-child) {
    border-bottom: 0.5px solid var(--ios-separator);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .skeleton-avatar {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    background: var(--ios-fill);
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-title {
    width: 120px;
    height: 14px;
    border-radius: 4px;
    background: var(--ios-fill);
  }

  .skeleton-meta {
    width: 80px;
    height: 12px;
    border-radius: 4px;
    background: var(--ios-fill-secondary);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 20px;
    color: var(--ios-gray);
  }

  .empty-title {
    margin: 16px 0 4px;
    font-size: 20px;
    font-weight: 600;
    color: var(--ios-label);
  }

  .empty-text {
    margin: 0 0 24px;
    font-size: 15px;
  }

  .empty-btn {
    padding: 12px 32px;
    border: none;
    border-radius: 12px;
    background: var(--ios-blue);
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .empty-btn:active {
    opacity: 0.7;
  }

  .list {
    display: flex;
    flex-direction: column;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    overflow: hidden;
  }

  .auction-item {
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
  }

  .auction-item:not(:last-child) {
    border-bottom: 0.5px solid var(--ios-separator);
  }

  .auction-item:active {
    background: var(--ios-fill-tertiary);
  }

  .auction-avatar {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .auction-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .auction-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .auction-name {
    font-size: 17px;
    font-weight: 400;
    color: var(--ios-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .live-badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: #fff;
    background: var(--ios-red);
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .auction-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 15px;
    color: var(--ios-gray);
  }

  .dot {
    opacity: 0.5;
  }

  .auction-bid {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 15px;
    font-weight: 500;
    color: var(--ios-label);
  }

  .star {
    font-size: 13px;
  }
</style>
