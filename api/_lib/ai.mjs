/**
 * 生成层：优先用知乎直答；额度不足时降级到模板化组合。
 *
 * 直答额度只有 100 次/天，所以策略是：
 *   1. 结果按内容指纹缓存，同样的问题当天不重复消耗
 *   2. 每日预算可配置，留出余量给真正的交互
 *   3. 失败或多档模型不可用时，用本地模板兜底，保证界面永远有内容
 */

import { zhida, quota, explainError } from './zhihu.mjs';
import { readSetting } from './settings.mjs';

const DAY = 24 * 60 * 60 * 1000;

// 进程内缓存在 Serverless 下会随实例销毁，属于尽力而为；本地常驻服务里效果最好
const cache = new Map();
const usage = { day: dayKey(Date.now()), count: 0 };

function dayKey(ts) {
  const d = new Date(ts + 8 * 3600 * 1000); // 北京时间
  return d.toISOString().slice(0, 10);
}

function budget() {
  return Number(readSetting('ZHIDA_DAILY_BUDGET') ?? 60);
}

function fingerprint(model, messages) {
  const raw = model + '|' + messages.map((m) => m.role + ':' + m.content).join('||');
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return 'c' + (h >>> 0).toString(36);
}

export function aiStatus() {
  const today = dayKey(Date.now());
  if (usage.day !== today) {
    usage.day = today;
    usage.count = 0;
  }
  return { used: usage.count, budget: budget(), remaining: Math.max(0, budget() - usage.count) };
}

/**
 * 调用直答并做预算保护。
 * 返回 { ok, content, reasoning, cached, model, degraded, reason }
 */
export async function generate(messages, { model = 'zhida-fast-1p5', key } = {}) {
  const today = dayKey(Date.now());
  if (usage.day !== today) {
    usage.day = today;
    usage.count = 0;
  }

  const fp = key ?? fingerprint(model, messages);
  const hit = cache.get(fp);
  if (hit && Date.now() - hit.at < DAY) {
    return { ok: true, ...hit.value, cached: true };
  }

  if (usage.count >= budget()) {
    return { ok: false, degraded: true, reason: '今日生成额度已用完，以下是基于本地规则的结果。' };
  }

  try {
    usage.count += 1;
    const r = await zhida(messages, { model });
    const value = { content: r.content, reasoning: r.reasoning, model: r.model };
    cache.set(fp, { at: Date.now(), value });
    return { ok: true, ...value, cached: false };
  } catch (e) {
    usage.count = Math.max(0, usage.count - 1); // 失败不占预算
    const info = explainError(e);
    return { ok: false, degraded: true, reason: info.message };
  }
}

/** 直接查线上额度，用于首屏展示真实剩余次数 */
export async function liveQuota() {
  try {
    const q = await quota();
    return {
      ok: true,
      zhida: q.zhida_openai ?? null,
      hotList: q.hot_list ?? null,
      search: q.zhihu_search ?? null,
      globalSearch: q.global_search ?? null,
      tools: q.tools ?? null,
      knowledge: q.knowledge ?? null,
    };
  } catch (e) {
    return { ok: false, reason: explainError(e).message };
  }
}

