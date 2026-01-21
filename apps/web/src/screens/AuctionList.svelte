<script lang="ts">
  import { onMount } from 'svelte'
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

  async function load() {
    loading = true
    const initData = getInitData()
    const status = filter === 'all' ? undefined : filter
    auctions = await apiGetAuctions(initData, status)
    loading = false
  }

  onMount(load)

  function setFilter(f: typeof filter) {
    if (f === filter) return
    triggerSelectionChanged()
    filter = f
    load()
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
    gap: 8px;
  }

  .filter-btn {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.05));
    color: var(--tg-theme-hint-color, #999);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .filter-btn.active {
    background: var(--tg-theme-button-color, #007aff);
    color: #fff;
  }

  .loading {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.04));
    border-radius: 12px;
    overflow: hidden;
  }

  .skeleton-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .skeleton-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--tg-theme-hint-color, rgba(0, 0, 0, 0.1));
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-title {
    width: 120px;
    height: 16px;
    border-radius: 4px;
    background: var(--tg-theme-hint-color, rgba(0, 0, 0, 0.1));
  }

  .skeleton-meta {
    width: 80px;
    height: 12px;
    border-radius: 4px;
    background: var(--tg-theme-hint-color, rgba(0, 0, 0, 0.08));
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 20px;
    color: var(--tg-theme-hint-color, #999);
  }

  .empty-title {
    margin: 12px 0 4px;
    font-size: 17px;
    font-weight: 600;
    color: var(--tg-theme-text-color, #000);
  }

  .empty-text {
    margin: 0 0 20px;
    font-size: 14px;
  }

  .empty-btn {
    padding: 12px 24px;
    border: none;
    border-radius: 10px;
    background: var(--tg-theme-button-color, #007aff);
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .empty-btn:active {
    transform: scale(0.97);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.04));
    border-radius: 12px;
    overflow: hidden;
  }

  .auction-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .auction-item:active {
    background: rgba(0, 0, 0, 0.04);
  }

  .auction-avatar {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
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
    gap: 2px;
  }

  .auction-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .auction-name {
    font-size: 16px;
    font-weight: 500;
    color: var(--tg-theme-text-color, #000);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .live-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #fff;
    background: linear-gradient(135deg, #ff3b30 0%, #ff2d55 100%);
    padding: 3px 7px;
    border-radius: 5px;
    box-shadow: 0 2px 6px rgba(255, 59, 48, 0.35);
    flex-shrink: 0;
  }

  .auction-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--tg-theme-hint-color, #999);
  }

  .dot {
    opacity: 0.5;
  }

  .auction-bid {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--tg-theme-text-color, #000);
  }

  .star {
    font-size: 13px;
  }
</style>
