import type { SlideRoute } from '../runtime/navigation.ts'
import { describe, expect, it } from 'bun:test'
import { getSlideRoutePath } from '../runtime/navigation.ts'

function route(no: number, alias?: string): Pick<SlideRoute, 'no' | 'alias'> {
  return { no, alias }
}

describe('getSlideRoutePath', () => {
  it('returns router paths for all playback modes', () => {
    expect(getSlideRoutePath(route(2))).toBe('/2')
    expect(getSlideRoutePath(route(2), 'presenter')).toBe('/presenter/2')
    expect(getSlideRoutePath(route(2), 'export')).toBe('/export/2')
  })

  it('uses route aliases', () => {
    expect(getSlideRoutePath(route(2, 'intro'))).toBe('/intro')
    expect(getSlideRoutePath(route(2, 'intro'), 'presenter')).toBe('/presenter/intro')
  })
})
