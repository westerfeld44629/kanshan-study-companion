import { useEffect, useState } from 'react'

/** 刘看山的六种状态，按语义映射到学习场景 */
const SPRITES = {
  hello: '/kanshan/打招呼_4秒_320x320_20fps_透明.gif',
  idle: '/kanshan/待机_5秒_320x320_20fps_透明.gif',
  thinking: '/kanshan/电脑_6秒_320x320_20fps_透明.gif',
  wander: '/kanshan/晃悠_320x320_3秒_20fps_透明.gif',
  sleepy: '/kanshan/瞌睡_5秒_320x320_20fps_透明.gif',
  play: '/kanshan/运球_4秒_320x320_20fps_透明.gif',
} as const

export type MateMood = keyof typeof SPRITES

export function Mate({ mood, say }: { mood: MateMood; say: string }) {
  return (
    <aside className="mate card">
      <img className="sprite" src={SPRITES[mood]} alt="刘看山" />
      <div className="say">{say}</div>
    </aside>
  )
}

/** 悬浮的小看山，用于加载态与空状态 */
export function MateMini({ mood = 'idle', size = 110 }: { mood?: MateMood; size?: number }) {
  return <img src={SPRITES[mood]} alt="刘看山" style={{ width: size }} />
}

export function useMood(initial: MateMood = 'idle') {
  const [mood, setMood] = useState<MateMood>(initial)
  useEffect(() => {
    // 长时间无操作时切换为打瞌睡，暗示可以休息
    let t = setTimeout(() => setMood('sleepy'), 90000)
    const wake = () => {
      clearTimeout(t)
      setMood((m) => (m === 'sleepy' ? 'idle' : m))
      t = setTimeout(() => setMood('sleepy'), 90000)
    }
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])
  return [mood, setMood] as const
}

