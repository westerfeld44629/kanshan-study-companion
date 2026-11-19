/**
 * 个性化推荐：热榜之外的第二条供给线。
 *
 * 痛点：热榜是公共内容，学习者画像（考研、转行、科研）常常一条都匹配不上，
 * 界面就变成「一堆和我无关的新闻」。所以需要主动按画像去搜索，
 * 把「你该看的」和「大家在聊的」分成两栏，各安其位。
 */

import { zhihuSearch, globalSearch } from './zhihu.mjs';
import { topDomains, zpdScore } from '../../shared/profile.mjs';
import { domainById } from '../../shared/domain.mjs';

/**
 * 每个领域在不同层级下的检索式。
 * 用的是真人会打进搜索框的说法，不是「领域名+动词」的机器拼装，
 * 否则搜出来一堆标题工整但没有信息量的内容。
 */
const QUERY_TEMPLATES = {
  entry: ['{d} 零基础 从哪开始', '{d} 入门 先学什么', '{d} 新手 踩过的坑'],
  intermediate: ['{d} 怎么做 实战经验', '{d} 方案 对比 怎么选', '{d} 进阶 提升'],
  advanced: ['{d} 局限 边界 在哪', '{d} 前沿进展', '{d} 架构 取舍'],
};

const NAME_OF = {
  python: 'Python', javascript: 'JavaScript', programming: '编程入门',
  frontend: '前端', backend: '后端开发', ml: '机器学习', dl: '深度学习',
  llm: '大模型', nlp: '自然语言处理', cv: '计算机视觉',
  data: '数据分析', math: '高等数学 概率', product: '产品经理', design: 'UI 设计',
  career: '面试 求职', exam: '考研', english: '英语',
  writing: '写作', research: '论文 科研', finance: '理财',
  health: '健身', psych: '焦虑 专注', photography: '摄影',
};

/**
 * 按画像生成检索任务。
 * 只取权重最高的两个领域，每个领域一条查询，控制额度消耗。
 */
export function buildQueries(profile, { maxDomains = 2 } = {}) {
  const tops = topDomains(profile, maxDomains);
  const out = [];
  for (const d of tops) {
    const z = zpdScore(profile, d.id);
    const name = NAME_OF[d.id] ?? d.name;
    const templates = QUERY_TEMPLATES[z.depth] ?? QUERY_TEMPLATES.entry;
    // 用领域 id 的字符和做确定性选择，避免每次刷新都换词导致结果抖动
    const idx = [...d.id].reduce((s, c) => s + c.charCodeAt(0), 0) % templates.length;
    out.push({
      domain: d.id,
      domainName: name,
      depth: z.depth,
      reason: z.reason,
      query: templates[idx].replace('{d}', name),
    });
  }
  return out;
}

/** 执行推荐检索。每个领域只取 6 条，去重后返回 */
export async function recommendFor(profile, { limitPerDomain = 6 } = {}) {
  const tasks = buildQueries(profile);
  if (!tasks.length) return { tasks, items: [] };

  const seen = new Set();
  const items = [];

  for (const t of tasks) {
    try {
      const r = await zhihuSearch(t.query, { count: Math.min(limitPerDomain, 10) });
      for (const it of r.items ?? []) {
        if (!it.Url || seen.has(it.Url)) continue;
        seen.add(it.Url);
        items.push({
          ...it,
          _domain: t.domain,
          _domainName: t.domainName,
          _depth: t.depth,
          _reason: t.reason,
          _query: t.query,
        });
      }
    } catch (e) {
      // 单个领域失败不阻塞整体，前端会显示其余结果
      items.push({ _error: true, _domain: t.domain, _domainName: t.domainName, _reason: e?.message });
    }
  }

  return { tasks, items };
}

