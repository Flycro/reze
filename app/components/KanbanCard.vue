<script setup lang="ts">
import type { CardData } from '~/utils/types'

const props = defineProps<{
  card: CardData
  dragging?: boolean
  focused?: boolean
}>()

const emit = defineEmits<{
  select: [card: CardData]
}>()

const repo = computed(() => repoFromUrl(props.card.url))
const showState = computed(() => props.card.state && props.card.state.toUpperCase() !== 'OPEN')

function stateClass(state: string) {
  const s = state.toLowerCase()
  if (s === 'closed') return 'bg-red-500/15 text-red-400'
  if (s === 'merged') return 'bg-purple-500/15 text-purple-400'
  return 'bg-green-500/15 text-green-400'
}
</script>

<template>
  <div
    class="flex flex-col gap-2 p-3 bg-elevated border rounded-lg sm:cursor-grab select-none transition-all hover:border-primary hover:shadow-md"
    :class="[
      dragging ? 'opacity-40 cursor-grabbing' : '',
      focused ? 'border-primary ring-1 ring-primary/30' : 'border-default'
    ]"
    @click="emit('select', card)"
    @dblclick="card.url && window.open(card.url, '_blank')"
  >
    <div v-if="card.parent" class="flex items-center gap-1 text-[11px] text-dimmed truncate min-w-0">
      <UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" />
      <span class="truncate">{{ card.parent.title }}</span>
    </div>

    <div class="flex items-start gap-2">
      <div class="flex-1 text-[13px] text-highlighted leading-snug break-words min-w-0">
        {{ card.title }}
      </div>
      <div v-if="card.assignees.length > 0" class="flex shrink-0">
        <UAvatar
          v-for="a in card.assignees"
          :key="a.login"
          :src="a.avatarUrl"
          :alt="a.login"
          size="2xs"
          class="-ml-1.5 first:ml-0 ring-2 ring-default"
        />
      </div>
    </div>

    <div v-if="card.subIssuesSummary" class="flex items-center gap-2">
      <div class="flex-1 h-1 rounded-full bg-default overflow-hidden">
        <div
          class="h-full rounded-full bg-primary transition-all"
          :style="{ width: `${card.subIssuesSummary.percentCompleted}%` }"
        />
      </div>
      <span class="text-[10px] text-dimmed whitespace-nowrap">{{ card.subIssuesSummary.completed }}/{{ card.subIssuesSummary.total }}</span>
    </div>

    <div
      v-if="card.number !== undefined || showState || card.labels.length > 0 || card.createdAt"
      class="flex items-center flex-wrap gap-1"
    >
      <UTooltip
        v-if="card.number !== undefined"
        :text="repo ? `${repo}#${card.number}` : `#${card.number}`"
        :delay-duration="500"
      >
        <span class="flex items-center gap-0.5 text-[11px] text-dimmed truncate max-w-[140px]">
          <UIcon
            :name="card.typename === 'PullRequest' ? 'i-lucide-git-pull-request' : card.typename === 'DraftIssue' ? 'i-lucide-file-edit' : 'i-lucide-circle-dot'"
            class="size-3 shrink-0"
            :class="card.state === 'MERGED' ? 'text-purple-400' : card.state === 'CLOSED' ? 'text-red-400' : 'text-green-400'"
          />
          {{ repo ? `${repo}#${card.number}` : `#${card.number}` }}
        </span>
      </UTooltip>
      <span
        v-if="showState"
        class="text-[10px] px-1.5 py-px rounded-full font-semibold uppercase tracking-wide"
        :class="stateClass(card.state!)"
      >
        {{ card.state }}
      </span>
      <span
        v-for="label in card.labels"
        :key="label.name"
        class="text-[11px] px-1.5 py-px rounded-full border font-medium"
        :style="{
          background: `#${label.color}22`,
          color: `#${label.color}`,
          borderColor: `#${label.color}44`,
        }"
      >
        {{ label.name }}
      </span>
    </div>
  </div>
</template>
