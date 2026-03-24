<script setup lang="ts">
import type { CardData } from '~/utils/types'
import { COLOR_MAP } from '~/utils/types'

const props = withDefaults(defineProps<{
  id: string
  title: string
  color: string
  cards: CardData[]
  droppable?: boolean
  selectedCardId?: string | null
}>(), {
  droppable: true
})

const emit = defineEmits<{
  select: [card: CardData]
  drop: [cardId: string, columnId: string]
}>()

const isOver = ref(false)
const isTouchDevice = import.meta.client && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

const accentColor = computed(() => COLOR_MAP[props.color] ?? '#8b949e')
const isEmpty = computed(() => props.cards.length === 0)

function onDragOver(e: DragEvent) {
  if (!props.droppable) return
  e.preventDefault()
  isOver.value = true
}

function onDragLeave() {
  isOver.value = false
}

function onDragStart(e: DragEvent, card: CardData) {
  e.dataTransfer?.setData('text/plain', card.id)
  e.dataTransfer!.effectAllowed = 'move'

  const ghost = document.createElement('div')
  ghost.textContent = card.title.length > 40 ? card.title.slice(0, 40) + '…' : card.title
  ghost.style.cssText = 'position:fixed;top:-1000px;padding:8px 12px;border-radius:8px;font-size:13px;max-width:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:white;background:var(--ui-primary);font-family:inherit;'
  document.body.appendChild(ghost)
  e.dataTransfer?.setDragImage(ghost, 0, 0)
  requestAnimationFrame(() => document.body.removeChild(ghost))
}

function onDrop(e: DragEvent) {
  isOver.value = false
  if (!props.droppable) return
  const cardId = e.dataTransfer?.getData('text/plain')
  if (cardId) {
    emit('drop', cardId, props.id)
  }
}
</script>

<template>
  <div
    class="flex flex-col shrink-0 bg-elevated/50 border border-default rounded-xl max-h-full transition-all max-sm:snap-center"
    :class="[
      isOver ? 'border-primary bg-primary/10' : '',
      isEmpty ? 'w-9 max-sm:w-9' : 'w-[85vw] sm:w-[280px]'
    ]"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div
      class="flex items-center gap-2 shrink-0 border-b border-default"
      :class="isEmpty ? 'justify-center py-2.5 px-0' : 'px-3.5 py-3'"
    >
      <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: accentColor }" />
      <span v-if="!isEmpty" class="text-[13px] font-semibold text-highlighted flex-1">{{ title }}</span>
      <UBadge v-if="!isEmpty" size="sm" variant="subtle" color="neutral">
        {{ cards.length }}
      </UBadge>
    </div>

    <div v-if="isEmpty" class="flex-1 flex items-center justify-center py-2">
      <span
        class="text-[11px] font-semibold opacity-70"
        :style="{ color: accentColor, writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: '0.5px' }"
      >
        {{ title }}
      </span>
    </div>

    <div v-else class="flex flex-col gap-2 p-2.5 overflow-y-auto flex-1">
      <div
        v-for="card in cards"
        :key="card.id"
        :draggable="!isTouchDevice"
        @dragstart="(e: DragEvent) => onDragStart(e, card)"
      >
        <KanbanCard :card="card" :focused="selectedCardId === card.id" @select="emit('select', $event)" />
      </div>
    </div>
  </div>
</template>
