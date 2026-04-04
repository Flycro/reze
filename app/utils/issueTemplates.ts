import { parseYAML } from 'confbox'

export interface FormField {
  type: 'markdown' | 'textarea' | 'input' | 'dropdown' | 'checkboxes'
  id?: string
  label?: string
  description?: string
  placeholder?: string
  value?: string
  required?: boolean
  options?: string[]
}

export interface IssueTemplate {
  name: string
  description: string
  title: string
  labels: string[]
  assignees: string[]
  body: string
  fields: FormField[]
  fileName: string
}

export function parseFrontmatter(raw: string): { meta: Record<string, any>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  return { meta: parseYAML(match[1]) ?? {}, body: match[2].trim() }
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v) return [v]
  return []
}

export function parseFormFields(rawFields: any[]): FormField[] {
  return rawFields.map((f): FormField => {
    const attrs = f.attributes ?? {}
    const options = (attrs.options ?? []).map((o: any) =>
      typeof o === 'object' ? o.label : String(o)
    )
    return {
      type: f.type,
      id: f.id,
      label: attrs.label,
      description: attrs.description,
      placeholder: attrs.placeholder,
      value: attrs.value,
      required: f.validations?.required === true,
      options: options.length > 0 ? options : undefined,
    }
  })
}

export function serializeFormFields(fields: FormField[], values: Record<string, any>): string {
  const sections: string[] = []

  for (const field of fields) {
    if (field.type === 'markdown') {
      if (field.value) sections.push(field.value)
      continue
    }

    const val = values[field.id ?? '']

    if (field.type === 'textarea' || field.type === 'input') {
      if (field.label) sections.push(`### ${field.label}`)
      sections.push(val || '_No response_')
    } else if (field.type === 'dropdown') {
      if (field.label) sections.push(`### ${field.label}`)
      sections.push(val || '_No response_')
    } else if (field.type === 'checkboxes') {
      if (field.label) sections.push(`### ${field.label}`)
      const checked: boolean[] = val ?? []
      const opts = field.options ?? []
      sections.push(opts.map((o, i) => `- [${checked[i] ? 'x' : ' '}] ${o}`).join('\n'))
    }
  }

  return sections.join('\n\n')
}

export function parseMarkdownTemplate(raw: string, fileName: string): IssueTemplate {
  const { meta, body } = parseFrontmatter(raw)
  return {
    name: meta.name || fileName.replace(/\.md$/, ''),
    description: meta.description || '',
    title: meta.title || '',
    labels: toArray(meta.labels),
    assignees: toArray(meta.assignees),
    body,
    fields: [],
    fileName,
  }
}

export function parseYamlTemplate(raw: string, fileName: string): IssueTemplate {
  const parsed = parseYAML(raw) as Record<string, any> | null
  if (!parsed) {
    return { name: fileName.replace(/\.ya?ml$/, ''), description: '', title: '', labels: [], assignees: [], body: '', fields: [], fileName }
  }

  const fields = Array.isArray(parsed.body) ? parseFormFields(parsed.body) : []

  return {
    name: parsed.name || fileName.replace(/\.ya?ml$/, ''),
    description: parsed.description || '',
    title: parsed.title || '',
    labels: toArray(parsed.labels),
    assignees: toArray(parsed.assignees),
    body: '',
    fields,
    fileName,
  }
}

export function parseTemplate(raw: string, fileName: string): IssueTemplate {
  if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
    return parseYamlTemplate(raw, fileName)
  }
  return parseMarkdownTemplate(raw, fileName)
}
