<script lang="ts">
  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import {
    IconPlus,
    IconSnowflake,
    IconSnowflakeOff,
    IconGift,
    IconArrowBack,
    IconReceipt,
  } from '@tabler/icons-svelte'
  import { apiGetHistory, type LedgerEntryDTO } from '../lib/api'
  import { getInitData } from '../lib/init-data'

  let entries: LedgerEntryDTO[] = []
  let loading = true
  let error = ''

  onMount(load)

  async function load() {
    loading = true
    error = ''
    try {
      const initData = getInitData()
      entries = await apiGetHistory(initData, 50)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Ошибка загрузки'
    } finally {
      loading = false
    }
  }

  type EntryMeta = {
    icon: typeof IconPlus
    color: string
    bg: string
    label: string
    sign: '+' | '-' | ''
  }

  function getEntryMeta(type: LedgerEntryDTO['type']): EntryMeta {
    const isDark = document.documentElement.classList.contains('dark')
    const green = isDark ? '#30D158' : '#34C759'
    const blue = isDark ? '#0A84FF' : '#007AFF'
    const orange = isDark ? '#FF9F0A' : '#FF9500'
    const gray = '#8E8E93'

    switch (type) {
      case 'deposit':
        return {
          icon: IconPlus,
          color: green,
          bg: isDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(52, 199, 89, 0.12)',
          label: 'Пополнение',
          sign: '+',
        }
      case 'hold':
        return {
          icon: IconSnowflake,
          color: blue,
          bg: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(0, 122, 255, 0.12)',
          label: 'Заморозка',
          sign: '-',
        }
      case 'release':
        return {
          icon: IconSnowflakeOff,
          color: green,
          bg: isDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(52, 199, 89, 0.12)',
          label: 'Разморозка',
          sign: '+',
        }
      case 'capture':
        return {
          icon: IconGift,
          color: orange,
          bg: isDark ? 'rgba(255, 159, 10, 0.15)' : 'rgba(255, 149, 0, 0.12)',
          label: 'Покупка',
          sign: '-',
        }
      case 'refund':
        return {
          icon: IconArrowBack,
          color: green,
          bg: isDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(52, 199, 89, 0.12)',
          label: 'Возврат',
          sign: '+',
        }
      default:
        return {
          icon: IconReceipt,
          color: gray,
          bg: 'rgba(142, 142, 147, 0.12)',
          label: 'Операция',
          sign: '',
        }
    }
  }

  function formatAmount(amount: string, sign: '+' | '-' | ''): string {
    const n = parseFloat(amount)
    const formatted = n.toLocaleString('ru-RU')
    return sign ? `${sign}${formatted}` : formatted
  }

  function formatTime(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return 'Только что'
    if (diffMin < 60) return `${diffMin} мин назад`
    if (diffHours < 24) return `${diffHours} ч назад`
    if (diffDays < 7) return `${diffDays} дн назад`

    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    })
  }

  function groupByDate(items: LedgerEntryDTO[]): Map<string, LedgerEntryDTO[]> {
    const groups = new Map<string, LedgerEntryDTO[]>()
    
    for (const item of items) {
      const date = new Date(item.created_at)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      let key: string
      if (date.toDateString() === today.toDateString()) {
        key = 'Сегодня'
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = 'Вчера'
      } else {
        key = date.toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
        })
      }

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(item)
    }

    return groups
  }

  $: grouped = groupByDate(entries)
</script>

<div class="history">
  {#if loading}
    <div class="loading">
      {#each [1, 2, 3, 4] as i}
        <div class="skeleton-item" style="animation-delay: {i * 60}ms">
          <div class="skeleton-icon"></div>
          <div class="skeleton-content">
            <div class="skeleton-title"></div>
            <div class="skeleton-sub"></div>
          </div>
          <div class="skeleton-amount"></div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      <button on:click={load}>Повторить</button>
    </div>
  {:else if entries.length === 0}
    <div class="empty">
      <IconReceipt size={32} stroke={1.5} />
      <span>Нет транзакций</span>
    </div>
  {:else}
    {#each [...grouped.entries()] as [dateKey, items], groupIdx}
      <div class="group" in:fly={{ y: 20, duration: 250, delay: groupIdx * 50, easing: cubicOut }}>
        <div class="group-header">{dateKey}</div>
        <div class="group-list">
          {#each items as entry, idx}
            {@const meta = getEntryMeta(entry.type)}
            <div 
              class="entry" 
              style="animation-delay: {(groupIdx * items.length + idx) * 30}ms"
            >
              <div class="entry-icon" style="background: {meta.bg}; color: {meta.color}">
                <svelte:component this={meta.icon} size={18} stroke={2} />
              </div>
              <div class="entry-content">
                <span class="entry-label">{meta.label}</span>
                {#if entry.note}
                  <span class="entry-note">{entry.note}</span>
                {:else}
                  <span class="entry-time">{formatTime(entry.created_at)}</span>
                {/if}
              </div>
              <div class="entry-amount" class:positive={meta.sign === '+'} class:negative={meta.sign === '-'}>
                <span class="star">⭐</span>
                <span>{formatAmount(entry.amount, meta.sign)}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .history {
    display: flex;
    flex-direction: column;
    gap: 16px;
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

  .skeleton-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--ios-fill);
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-title {
    width: 80px;
    height: 14px;
    border-radius: 4px;
    background: var(--ios-fill);
  }

  .skeleton-sub {
    width: 60px;
    height: 10px;
    border-radius: 4px;
    background: var(--ios-fill-secondary);
  }

  .skeleton-amount {
    width: 50px;
    height: 16px;
    border-radius: 4px;
    background: var(--ios-fill);
  }

  .empty {
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

  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 20px;
    color: var(--ios-gray);
  }

  .error button {
    margin-top: 16px;
    padding: 10px 24px;
    border: none;
    border-radius: 8px;
    background: var(--ios-fill-secondary);
    color: var(--ios-blue);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .error button:active {
    opacity: 0.7;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-header {
    font-size: 13px;
    font-weight: 600;
    color: var(--ios-gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px;
  }

  .group-list {
    display: flex;
    flex-direction: column;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    overflow: hidden;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    animation: fade-in 200ms ease backwards;
  }

  @keyframes fade-in {
    from { 
      opacity: 0; 
      transform: translateY(4px); 
    }
  }

  .entry:not(:last-child) {
    border-bottom: 0.5px solid var(--ios-separator);
  }

  .entry-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .entry-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .entry-label {
    font-size: 17px;
    font-weight: 400;
    color: var(--ios-label);
  }

  .entry-note {
    font-size: 15px;
    color: var(--ios-gray);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entry-time {
    font-size: 15px;
    color: var(--ios-gray);
  }

  .entry-amount {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 17px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--ios-gray);
  }

  .entry-amount.positive {
    color: var(--ios-green);
  }

  .entry-amount.negative {
    color: var(--ios-label);
  }

  .star {
    font-size: 13px;
  }
</style>
