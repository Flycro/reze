<script setup lang="ts">
const {
  primaryColors,
  neutralColors,
  primary,
  neutral,
  blackAsPrimary,
  setBlackAsPrimary,
  resetTheme,
} = useTheme()

const open = ref(false)

const colorHex: Record<string, string> = {
  sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  purple: '#a855f7', fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
  red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308',
  lime: '#84cc16', green: '#22c55e', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', slate: '#64748b', gray: '#6b7280', zinc: '#71717a',
  neutral: '#737373', stone: '#78716c', mauve: '#8b7a8b', olive: '#808a5c',
  mist: '#6b8a9e', taupe: '#8a7e73',
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'w-64 px-5 py-4 flex flex-col gap-3.5' }">
    <UButton
      icon="i-lucide-palette"
      color="neutral"
      :variant="open ? 'soft' : 'ghost'"
      size="xs"
    />

    <template #content>
      <!-- Primary Color -->
      <fieldset>
        <legend class="text-[11px] leading-none font-semibold mb-2 select-none text-muted">
          Primary
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            class="size-5 rounded-full transition-all bg-black dark:bg-white"
            :class="blackAsPrimary ? 'ring-2 ring-offset-2 ring-offset-default ring-primary scale-110' : 'hover:scale-110'"
            title="Black"
            @click="setBlackAsPrimary(true)"
          />
          <button
            v-for="color in primaryColors"
            :key="color"
            class="size-5 rounded-full transition-all"
            :class="!blackAsPrimary && primary === color ? 'ring-2 ring-offset-2 ring-offset-default ring-primary scale-110' : 'hover:scale-110'"
            :style="{ background: colorHex[color] }"
            :title="color"
            @click="primary = color"
          />
        </div>
      </fieldset>

      <!-- Neutral Color -->
      <fieldset>
        <legend class="text-[11px] leading-none font-semibold mb-2 select-none text-muted">
          Neutral
        </legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="color in neutralColors"
            :key="color"
            class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-colors"
            :class="neutral === color
              ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
              : 'bg-elevated/50 text-muted hover:text-highlighted'"
            @click="neutral = color"
          >
            <span class="size-2.5 rounded-full" :style="{ background: colorHex[color] }" />
            {{ color }}
          </button>
        </div>
      </fieldset>

      <!-- Reset -->
      <UButton
        color="neutral"
        variant="outline"
        size="xs"
        icon="i-lucide-rotate-ccw"
        block
        @click="resetTheme"
      >
        Reset to defaults
      </UButton>
    </template>
  </UPopover>
</template>
