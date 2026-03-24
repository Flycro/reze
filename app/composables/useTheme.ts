const primaryColors = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose',
]

const neutralColors = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe']

export function useTheme() {
  const appConfig = useAppConfig()

  const _blackAsPrimary = useState('reze-black-primary', () => {
    if (import.meta.client) return localStorage.getItem('reze-black-primary') === '1'
    return false
  })

  const blackAsPrimary = computed(() => _blackAsPrimary.value)

  function setBlackAsPrimary(val: boolean) {
    _blackAsPrimary.value = val
    if (import.meta.client) {
      if (val) localStorage.setItem('reze-black-primary', '1')
      else localStorage.removeItem('reze-black-primary')
    }
  }

  const primary = computed({
    get: () => appConfig.ui.colors.primary,
    set(val: string) {
      appConfig.ui.colors.primary = val
      setBlackAsPrimary(false)
      if (import.meta.client) localStorage.setItem('reze-primary', val)
    }
  })

  const neutral = computed({
    get: () => appConfig.ui.colors.neutral,
    set(val: string) {
      appConfig.ui.colors.neutral = val
      if (import.meta.client) localStorage.setItem('reze-neutral', val)
    }
  })

  const blackStyle = computed(() =>
    _blackAsPrimary.value
      ? `:root { --ui-primary: black; } .dark { --ui-primary: white; }`
      : ':root {}'
  )

  useHead({
    style: [
      { innerHTML: blackStyle, id: 'reze-black-primary', tagPriority: -2 }
    ]
  })

  if (import.meta.client) {
    const savedPrimary = localStorage.getItem('reze-primary')
    const savedNeutral = localStorage.getItem('reze-neutral')
    if (savedPrimary) appConfig.ui.colors.primary = savedPrimary
    if (savedNeutral) appConfig.ui.colors.neutral = savedNeutral
  }

  function resetTheme() {
    primary.value = 'sky'
    neutral.value = 'slate'
    setBlackAsPrimary(false)
    if (import.meta.client) {
      localStorage.removeItem('reze-primary')
      localStorage.removeItem('reze-neutral')
    }
  }

  return {
    primaryColors,
    neutralColors,
    primary,
    neutral,
    blackAsPrimary,
    setBlackAsPrimary,
    resetTheme,
  }
}
