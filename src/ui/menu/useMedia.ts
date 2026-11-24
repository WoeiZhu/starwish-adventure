import { useEffect, useState } from 'react'

/** 版面斷點：和 menu2.css 的 @media 一致 */
export const MQ = {
  /** 電腦：寬而且不矮，背包用三欄 */
  desktop: '(min-width: 1100px) and (min-height: 561px)',
  /** 手機橫拿 */
  phoneLandscape: '(max-height: 560px) and (orientation: landscape)',
}

export function useMedia(query: string) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const f = () => setOn(mq.matches)
    f()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [query])
  return on
}
