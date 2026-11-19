import { applyEvent, emptyProfile } from '../shared/profile.mjs'
import { buildQueries } from '../api/_lib/recommend.mjs'

const personas = {
  'A 考研党': [
    { kind: 'react', topic: '考研数学 线性代数 概率', signal: 'deeper' },
    { kind: 'react', topic: '英语六级 背单词', signal: 'deeper' },
    { kind: 'react', topic: '考研 复试 面试', signal: 'deeper' },
  ],
  'B 转行算法': [
    { kind: 'react', topic: '机器学习 特征工程 交叉验证', signal: 'deeper' },
    { kind: 'react', topic: '深度学习 梯度下降', signal: 'deeper' },
  ],
  'C 前端转AI': [
    { kind: 'react', topic: 'javascript react 前端性能', signal: 'deeper' },
    { kind: 'react', topic: '大模型 agent rag', signal: 'deeper' },
  ],
  'F 科研新手': [
    { kind: 'react', topic: '科研 论文 文献 综述', signal: 'deeper' },
    { kind: 'react', topic: '数学 概率 统计推断', signal: 'deeper' },
  ],
}

for (const [name, evs] of Object.entries(personas)) {
  let p = emptyProfile(1)
  for (const e of evs) p = applyEvent(p, e, Date.now())
  console.log('== ' + name + ' ==')
  for (const q of buildQueries(p)) {
    console.log(`   [${q.domainName}/${q.depth}] "${q.query}"  ← ${q.reason}`)
  }
}

