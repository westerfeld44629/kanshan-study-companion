import { applyEvent, emptyProfile } from '../shared/profile.mjs'
import { recommendFor } from '../api/_lib/recommend.mjs'

let p = emptyProfile(1)
p = applyEvent(p, { kind: 'react', topic: '大模型 agent rag 提示词', signal: 'deeper' }, 1)
p = applyEvent(p, { kind: 'react', topic: '深度学习 transformer', signal: 'deeper' }, 2)

const r = await recommendFor(p)
console.log('查询:', r.tasks.map(t => t.query))
console.log('结果数:', r.items.length)
for (const it of r.items.slice(0, 8)) {
  console.log(`[${it._domainName}] ${(it.Title||'').slice(0,52)}`)
}

