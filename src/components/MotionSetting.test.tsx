import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MotionSettingControl } from './MotionSetting'

describe('motion setting', () => {
  it('shows an on-by-default app switch with a 44px control', () => {
    const markup = renderToStaticMarkup(
      <MotionSettingControl
        enabled
        saving={false}
        error=""
        onToggle={() => undefined}
      />,
    )

    expect(markup).toContain('>Motion<')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('min-h-11')
    expect(markup).toContain('On')
  })
})
