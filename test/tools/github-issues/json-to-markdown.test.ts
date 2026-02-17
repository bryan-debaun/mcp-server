import { describe, it, expect } from 'vitest'
import { jsonToMarkdown } from '../../../src/tools/github-issues/json-to-markdown.js'

describe('jsonToMarkdown', () => {
    it('renders flat object as bullet list', () => {
        const input = { title: 'Hello', count: 3 }
        const md = jsonToMarkdown(input)
        expect(md).toContain('**title**: Hello')
        expect(md).toContain('**count**: 3')
    })

    it('renders nested object as JSON code block', () => {
        const input = { nested: { a: 1 } }
        const md = jsonToMarkdown(input)
        expect(md.trim()).toMatch(/^```json\n/)
        expect(md).toContain('"nested"')
    })

    it('renders arrays as JSON code block', () => {
        const input = [1, 2, 3]
        const md = jsonToMarkdown(input)
        expect(md.trim()).toMatch(/^```json\n/)
        expect(md).toContain('[\n  1,')
    })
})
