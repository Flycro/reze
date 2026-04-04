import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  parseMarkdownTemplate,
  parseYamlTemplate,
  parseTemplate,
  parseFormFields,
  serializeFormFields,
} from '../app/utils/issueTemplates'

describe('parseFrontmatter', () => {
  it('parses frontmatter and body', () => {
    const raw = `---
name: Bug Report
description: File a bug report
---

## Steps to reproduce`

    const result = parseFrontmatter(raw)
    expect(result.meta.name).toBe('Bug Report')
    expect(result.meta.description).toBe('File a bug report')
    expect(result.body).toBe('## Steps to reproduce')
  })

  it('returns raw content when no frontmatter', () => {
    const raw = 'Just a plain markdown body'
    const result = parseFrontmatter(raw)
    expect(result.meta).toEqual({})
    expect(result.body).toBe(raw)
  })

  it('parses array values in frontmatter', () => {
    const raw = `---
labels: [bug, critical]
assignees:
  - alice
  - bob
---

Body`

    const result = parseFrontmatter(raw)
    expect(result.meta.labels).toEqual(['bug', 'critical'])
    expect(result.meta.assignees).toEqual(['alice', 'bob'])
  })

  it('handles empty frontmatter values', () => {
    const raw = `---
name: Test
labels: []
---

Body`

    const result = parseFrontmatter(raw)
    expect(result.meta.name).toBe('Test')
    expect(result.meta.labels).toEqual([])
  })
})

describe('parseMarkdownTemplate', () => {
  it('parses a full markdown template', () => {
    const raw = `---
name: Bug Report
description: File a bug report
title: "[Bug]: "
labels: [bug, triage]
assignees:
  - octocat
---

## Description

Describe the bug here.

## Steps to Reproduce

1. Go to ...
2. Click on ...
3. See error`

    const result = parseMarkdownTemplate(raw, 'bug_report.md')
    expect(result.name).toBe('Bug Report')
    expect(result.description).toBe('File a bug report')
    expect(result.title).toBe('[Bug]: ')
    expect(result.labels).toEqual(['bug', 'triage'])
    expect(result.assignees).toEqual(['octocat'])
    expect(result.body).toContain('## Description')
    expect(result.body).toContain('## Steps to Reproduce')
    expect(result.fields).toEqual([])
    expect(result.fileName).toBe('bug_report.md')
  })

  it('uses filename as name when no frontmatter name', () => {
    const raw = `---
description: A template
---

Body here`

    const result = parseMarkdownTemplate(raw, 'feature_request.md')
    expect(result.name).toBe('feature_request')
  })

  it('handles template with no frontmatter', () => {
    const raw = '## Just a body\n\nNo frontmatter here.'
    const result = parseMarkdownTemplate(raw, 'simple.md')
    expect(result.name).toBe('simple')
    expect(result.body).toBe(raw)
    expect(result.labels).toEqual([])
    expect(result.assignees).toEqual([])
  })
})

describe('parseFormFields', () => {
  it('parses textarea field', () => {
    const fields = parseFormFields([{
      type: 'textarea',
      id: 'desc',
      attributes: {
        label: 'Description',
        description: 'A clear description',
        placeholder: 'Tell us...',
        value: 'Default text',
      },
      validations: { required: true },
    }])

    expect(fields).toHaveLength(1)
    expect(fields[0]).toEqual({
      type: 'textarea',
      id: 'desc',
      label: 'Description',
      description: 'A clear description',
      placeholder: 'Tell us...',
      value: 'Default text',
      required: true,
      options: undefined,
    })
  })

  it('parses input field', () => {
    const fields = parseFormFields([{
      type: 'input',
      id: 'version',
      attributes: { label: 'Version', placeholder: 'e.g. 1.2.3' },
    }])

    expect(fields[0].type).toBe('input')
    expect(fields[0].label).toBe('Version')
    expect(fields[0].placeholder).toBe('e.g. 1.2.3')
    expect(fields[0].required).toBe(false)
  })

  it('parses dropdown field with string options', () => {
    const fields = parseFormFields([{
      type: 'dropdown',
      id: 'priority',
      attributes: { label: 'Priority', options: ['Low', 'Medium', 'High'] },
      validations: { required: true },
    }])

    expect(fields[0].type).toBe('dropdown')
    expect(fields[0].options).toEqual(['Low', 'Medium', 'High'])
    expect(fields[0].required).toBe(true)
  })

  it('parses checkboxes with object options', () => {
    const fields = parseFormFields([{
      type: 'checkboxes',
      id: 'terms',
      attributes: {
        label: 'Agreements',
        options: [
          { label: 'I agree to the terms' },
          { label: 'I have read the docs' },
        ],
      },
    }])

    expect(fields[0].type).toBe('checkboxes')
    expect(fields[0].options).toEqual(['I agree to the terms', 'I have read the docs'])
  })

  it('parses markdown field', () => {
    const fields = parseFormFields([{
      type: 'markdown',
      attributes: { value: '**Please read the guidelines**' },
    }])

    expect(fields[0].type).toBe('markdown')
    expect(fields[0].value).toBe('**Please read the guidelines**')
  })
})

describe('serializeFormFields', () => {
  it('serializes textarea and input values', () => {
    const fields = parseFormFields([
      { type: 'textarea', id: 'desc', attributes: { label: 'Description' } },
      { type: 'input', id: 'version', attributes: { label: 'Version' } },
    ])

    const result = serializeFormFields(fields, {
      desc: 'The app crashes on startup',
      version: '2.1.0',
    })

    expect(result).toContain('### Description')
    expect(result).toContain('The app crashes on startup')
    expect(result).toContain('### Version')
    expect(result).toContain('2.1.0')
  })

  it('shows "No response" for empty fields', () => {
    const fields = parseFormFields([
      { type: 'textarea', id: 'desc', attributes: { label: 'Description' } },
    ])

    const result = serializeFormFields(fields, { desc: '' })
    expect(result).toContain('_No response_')
  })

  it('serializes dropdown selection', () => {
    const fields = parseFormFields([{
      type: 'dropdown',
      id: 'priority',
      attributes: { label: 'Priority', options: ['Low', 'Medium', 'High'] },
    }])

    const result = serializeFormFields(fields, { priority: 'High' })
    expect(result).toContain('### Priority')
    expect(result).toContain('High')
  })

  it('serializes checkbox selections', () => {
    const fields = parseFormFields([{
      type: 'checkboxes',
      id: 'terms',
      attributes: {
        label: 'Agreements',
        options: [
          { label: 'I agree to the terms' },
          { label: 'I have read the docs' },
        ],
      },
    }])

    const result = serializeFormFields(fields, {
      terms: [true, false],
    })

    expect(result).toContain('- [x] I agree to the terms')
    expect(result).toContain('- [ ] I have read the docs')
  })

  it('serializes unchecked checkboxes when no values provided', () => {
    const fields = parseFormFields([{
      type: 'checkboxes',
      id: 'terms',
      attributes: {
        label: 'Checks',
        options: [{ label: 'Option A' }, { label: 'Option B' }],
      },
    }])

    const result = serializeFormFields(fields, {})
    expect(result).toContain('- [ ] Option A')
    expect(result).toContain('- [ ] Option B')
  })

  it('includes markdown fields as-is', () => {
    const fields = parseFormFields([
      { type: 'markdown', attributes: { value: '**Read the guidelines**' } },
      { type: 'textarea', id: 'desc', attributes: { label: 'Description' } },
    ])

    const result = serializeFormFields(fields, { desc: 'My description' })
    expect(result).toContain('**Read the guidelines**')
    expect(result).toContain('My description')
  })

  it('handles mixed field types in order', () => {
    const fields = parseFormFields([
      { type: 'markdown', attributes: { value: 'Preamble' } },
      { type: 'input', id: 'title', attributes: { label: 'Summary' } },
      { type: 'textarea', id: 'steps', attributes: { label: 'Steps' } },
      { type: 'dropdown', id: 'sev', attributes: { label: 'Severity', options: ['Low', 'High'] } },
      { type: 'checkboxes', id: 'acks', attributes: { label: 'Acknowledgements', options: [{ label: 'Confirmed' }] } },
    ])

    const result = serializeFormFields(fields, {
      title: 'Login broken',
      steps: '1. Open app\n2. Click login',
      sev: 'High',
      acks: [true],
    })

    const lines = result.split('\n')
    const preambleIdx = lines.indexOf('Preamble')
    const summaryIdx = lines.indexOf('### Summary')
    const stepsIdx = lines.indexOf('### Steps')
    const sevIdx = lines.indexOf('### Severity')
    const ackIdx = lines.indexOf('### Acknowledgements')

    expect(preambleIdx).toBeLessThan(summaryIdx)
    expect(summaryIdx).toBeLessThan(stepsIdx)
    expect(stepsIdx).toBeLessThan(sevIdx)
    expect(sevIdx).toBeLessThan(ackIdx)
    expect(result).toContain('- [x] Confirmed')
  })
})

describe('parseYamlTemplate', () => {
  it('parses fields as structured FormField objects', () => {
    const raw = `name: Bug Report
description: File a bug report
title: "[Bug]: "
labels: [bug, triage]
assignees:
  - octocat
body:
  - type: markdown
    attributes:
      value: Thanks for reporting!
  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: A clear description of the bug.
      placeholder: Tell us what you see!
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
      placeholder: e.g. 1.2.3
    validations:
      required: true`

    const result = parseYamlTemplate(raw, 'bug_report.yml')
    expect(result.name).toBe('Bug Report')
    expect(result.title).toBe('[Bug]: ')
    expect(result.labels).toEqual(['bug', 'triage'])
    expect(result.assignees).toEqual(['octocat'])
    expect(result.body).toBe('')
    expect(result.fields).toHaveLength(3)
    expect(result.fields[0].type).toBe('markdown')
    expect(result.fields[0].value).toBe('Thanks for reporting!')
    expect(result.fields[1].type).toBe('textarea')
    expect(result.fields[1].label).toBe('What happened?')
    expect(result.fields[1].required).toBe(true)
    expect(result.fields[2].type).toBe('input')
    expect(result.fields[2].label).toBe('Version')
  })

  it('handles empty/invalid yaml gracefully', () => {
    const result = parseYamlTemplate('', 'empty.yml')
    expect(result.name).toBe('empty')
    expect(result.body).toBe('')
    expect(result.fields).toEqual([])
  })

  it('handles template with no body fields', () => {
    const raw = `name: Simple
description: A simple template`

    const result = parseYamlTemplate(raw, 'simple.yml')
    expect(result.name).toBe('Simple')
    expect(result.fields).toEqual([])
  })
})

describe('parseTemplate', () => {
  it('dispatches .md files to markdown parser', () => {
    const raw = `---
name: Bug
---

Body`
    const result = parseTemplate(raw, 'bug.md')
    expect(result.name).toBe('Bug')
    expect(result.body).toBe('Body')
    expect(result.fields).toEqual([])
  })

  it('dispatches .yml files to yaml parser with structured fields', () => {
    const raw = `name: Feature
description: A feature request
body:
  - type: textarea
    id: desc
    attributes:
      label: Description`

    const result = parseTemplate(raw, 'feature.yml')
    expect(result.name).toBe('Feature')
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].type).toBe('textarea')
  })

  it('dispatches .yaml files to yaml parser', () => {
    const raw = `name: Test
body:
  - type: input
    id: name
    attributes:
      label: Name`

    const result = parseTemplate(raw, 'test.yaml')
    expect(result.name).toBe('Test')
    expect(result.fields).toHaveLength(1)
  })
})
