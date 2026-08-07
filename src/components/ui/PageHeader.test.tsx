import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PageHeader } from './PageHeader'

const markup = renderToStaticMarkup(
  <PageHeader
    eyebrow="Catalogue"
    title="Services"
    subtitle="Prices and booking terms."
    action={<a href="#new">Add service</a>}
  />,
)

function classesOf(tag: string): string[] {
  const match = new RegExp(`<${tag}[^>]*class="([^"]*)"`).exec(markup)
  return (match?.[1] ?? '').split(/\s+/).filter(Boolean)
}

/** Size utilities only — `text-ink` and friends are colours, not type scale. */
function typeScale(classes: string[], prefix: string): string[] {
  const colours = /^text-(ink|muted|accent|paper|canvas|danger|warning)/
  return classes
    .filter((name) => name.startsWith(`${prefix}text-`))
    .filter((name) => !colours.test(name.slice(prefix.length)))
}

describe('PageHeader', () => {
  it('keeps the eyebrow, title, subtitle and action in one semantic header', () => {
    expect(markup).toMatch(/^<header/)
    expect(markup).toContain('<h1')
    expect(markup).toContain('Catalogue')
    expect(markup).toContain('Prices and booking terms.')
    expect(markup).toContain('Add service')
  })

  /*
   * The reason this component exists. Before it, every page opened with a 48px serif title and
   * generous margins, and on a 393x852 iPhone that left 310px of a 787px pane for content —
   * on Backup, 207px. The title must stay a step smaller on a phone than it is from `md` up.
   * A regression here is invisible on a laptop, which is exactly why it is asserted.
   */
  it('sets a smaller title on a phone than from md up', () => {
    const heading = classesOf('h1')
    const phone = typeScale(heading, '')
    const tablet = typeScale(heading, 'md:')

    expect(phone).toHaveLength(1)
    expect(tablet).toHaveLength(1)
    expect(phone[0]).not.toBe(tablet[0]!.slice('md:'.length))
  })

  it('opens with tighter spacing on a phone than from md up', () => {
    const wrapper = classesOf('header')

    expect(wrapper.some((name) => /^mb-\d/.test(name))).toBe(true)
    expect(wrapper.some((name) => /^md:mb-\d/.test(name))).toBe(true)
  })
})
