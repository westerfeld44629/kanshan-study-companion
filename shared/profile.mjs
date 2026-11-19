/**
 * 画像引擎（纯函数，无副作用，便于单测与本地验证）
 *
 * 三层结构：
 *   domains  领域向量 —— 关注什么、强度多少
 *   level    层级估计 —— 该领域处在 1 新手 / 2 能对话 / 3 能判断 / 4 能产出
 *   gaps     缺口清单 —— 想做 A，但 A 的前置 B 还没补
 *
 * 设计原则：所有更新都是增量、可解释的；任何一次更新都记录 evidence，
 * 界面上要能回答“为什么你觉得我懂这个”。
 */

import { detectDomains, domainById, prerequisitesOf } from './domain.mjs';
import { backfillLongMemory, lessonPlanId, LONG_MEMORY_LABELS, recallLongMemory, updateLongMemory } from './long-memory.mjs';

export const LEVELS = [
  { value: 1, label: '刚接触', hint: '希望从例子和术语开始' },
  { value: 2, label: '了解一些概念', hint: '想把概念连起来并做基础练习' },
  { value: 3, label: '做过相关练习', hint: '希望比较方法和适用条件' },
  { value: 4, label: '有独立实践经验', hint: '希望检查证据、边界和复现条件' },
];

export const MAX_LEARNING_MEMORIES = 20;
export const MAX_LEARNING_MEMORY_TEXT = 240;
export const LEARNING_MEMORY_LABELS = {
  preference: '学习偏好',
  note: '学习笔记',
  blocker: '学习卡点',
};

export function emptyProfile(now = Date.now()) {
  return {
    version: 2,
    createdAt: now,
    updatedAt: now,
    domains: {},
    gaps: [],
    events: [],
    corrected: {},
    goal: null,
    longMemory: [],
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function ensureDomain(profile, id, now) {
  if (!profile.domains[id]) {
    profile.domains[id] = {
      id,
      weight: 0.2,
      level: 1,
      confidence: 0,
      evidence: 0,
      lastSeen: now,
      wantsDepth: 0,
    };
  }
  return profile.domains[id];
}

export function migrateProfile(profile) {
  if (profile?.version === 2) {
    if (Array.isArray(profile.longMemory)) return profile;
    return { ...profile, longMemory: backfillLongMemory(profile.events) };
  }
  if (profile?.version !== 1) return emptyProfile();
  const p = { ...emptyProfile(profile.createdAt), ...profile, version: 2, goal: null, domains: {}, gaps: [] };
  p.corrected = {};
  for (const [id, previous] of Object.entries(profile.domains ?? {})) {
    const manual = previous.correctedByUser && Number.isInteger(profile.corrected?.[id]);
    p.domains[id] = {
      ...previous,
      level: manual ? clamp(profile.corrected[id], 1, 4) : 1,
      confidence: 0,
      correctedByUser: Boolean(manual),
      ...(manual ? { assessment: 'self' } : {}),
    };
    if (manual) p.corrected[id] = p.domains[id].level;
  }
  recomputeGaps(p);
  return p;
}

export function saveLearningMemory(profile, entry) {
  const text = entry.text.trim().slice(0, MAX_LEARNING_MEMORY_TEXT).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  if (!entry.id.trim() || !text || !Object.hasOwn(LEARNING_MEMORY_LABELS, entry.kind)) return profile;

  const memories = profile.memories ?? [];
  if (memories.length >= MAX_LEARNING_MEMORIES && !memories.some((item) => item.id === entry.id)) return profile;
  return {
    ...profile,
    updatedAt: Date.now(),
    memories: [...memories.filter((item) => item.id !== entry.id), { id: entry.id, kind: entry.kind, text }],
  };
}

export function removeLearningMemory(profile, id) {
  if (!profile.memories?.some((item) => item.id === id)) return profile;
  return { ...profile, updatedAt: Date.now(), memories: profile.memories.filter((item) => item.id !== id) };
}

export function getLongMemory(profile) {
  return structuredClone(migrateProfile(profile).longMemory);
}

export function clearLongMemory(profile) {
  if (Array.isArray(profile.longMemory) && !profile.longMemory.length) return profile;
  // The explicit empty store prevents hydration from historical events after forgetting.
  return { ...migrateProfile(profile), updatedAt: Date.now(), longMemory: [] };
}

export function forgetLongMemory(profile, id) {
  const hydrated = migrateProfile(profile);
  const records = hydrated.longMemory.filter((record) => record.id !== id);
  if (records.length === hydrated.longMemory.length) return profile;
  return { ...hydrated, updatedAt: Date.now(), longMemory: records };
}

export function clearPlanFromProfile(profile, plan) {
  const { goal, longMemory } = migrateProfile(profile);
  const lessons = new Set(plan?.steps.flatMap(({ id }) => [id, `${id}:expanded`]));
  const planIds = new Set(plan ? [plan.id] : longMemory.filter((record) => record.source.plan &&
    goal && record.goal === goal.text && record.domain === goal.domain).map((record) => record.source.plan));
  const isPlanLesson = (lesson) => Boolean(lesson && (lessons.has(lesson) || planIds.has(lessonPlanId(lesson))));
  const events = profile.events.filter((event) => {
    if (event.kind === 'intake' && goal) {
      return event.domain !== goal.domain || event.goal !== goal.text;
    }
    if (event.kind === 'assessment' || event.kind === 'correction') return !isPlanLesson(event.lesson);
    if (event.kind === 'project') return !planIds.has(event.plan);
    if (event.kind === 'ask') return !isPlanLesson(event.thread);
    return true;
  });
  const records = longMemory.filter(({ source }) => !planIds.has(source.plan) && !isPlanLesson(source.lesson ?? source.thread));
  if (!goal && events.length === profile.events.length && records.length === longMemory.length) return profile;
  return { ...profile, updatedAt: Date.now(), goal: null, events, longMemory: records };
}

export function clearChatFromProfile(profile, threadIds, all = false) {
  const ids = new Set(threadIds);
  const matches = (thread) => typeof thread === 'string' && thread.trim() && (all || ids.has(thread));
  const events = profile.events.filter((event) =>
    event.kind !== 'ask' || !matches(event.thread));
  const { longMemory } = migrateProfile(profile);
  const records = longMemory.filter(({ source }) => source.kind !== 'ask' || !matches(source.thread));
  if (events.length === profile.events.length && records.length === longMemory.length) return profile;
  return { ...profile, updatedAt: Date.now(), events, longMemory: records };
}

function pushEvent(profile, event) {
  profile.events.push(event);
  if (profile.events.length > 300) profile.events.splice(0, profile.events.length - 300);
}

function recomputeGaps(profile) {
  const gaps = [];
  for (const [id, d] of Object.entries(profile.domains)) {
    if (d.weight < 0.35) continue;
    for (const pre of prerequisitesOf(id)) {
      const preState = profile.domains[pre];
      // 只有用户在某个前置上留下过明确信号（答错、手动调低、点过无关），
      // 才认为这是真缺口；从未提及的前置不代表不会。
      if (!preState?.assessment) continue;
      const preLevel = preState.level;
      if (preLevel < 2.0) {
        const preName = domainById(pre)?.name ?? pre;
        gaps.push({
          domain: id,
          domainName: domainById(id)?.name ?? id,
          missing: pre,
          missingName: preName,
          reason: preState.assessment === 'quiz' ? '该前置的基础自测有待订正' : '你在这个前置领域选择了刚接触',
          priority: clamp(d.weight * (2.0 - preLevel), 0, 3),
        });
      }
    }
  }
  gaps.sort((a, b) => b.priority - a.priority);
  profile.gaps = gaps.slice(0, 6);
}

/**
 * 核心更新函数。
 * event.kind:
 *   react    { topic, signal: 'known' | 'deeper' | 'irrelevant' }
 *   open     { topic, dwellMs }
 *   ask      { text }
 *   quiz     { domain, correct, total }
 *   correct  { domain, level }  ← 用户手动纠正，权重最高
 */
export function applyEvent(profile, event, now = Date.now()) {
  const p = structuredClone(migrateProfile(profile));
  p.updatedAt = now;

  if (event.kind === 'intake' && domainById(event.domain)) {
    const goal = { domain: event.domain, text: String(event.goal).trim().slice(0, 180), minutes: event.minutes };
    p.goal = goal;
    const state = ensureDomain(p, event.domain, now);
    state.weight = Math.max(1, state.weight);
    if (event.level && state.assessment !== 'quiz') {
      state.level = clamp(event.level, 1, 4);
      state.assessment = 'self';
      p.corrected[event.domain] = state.level;
      state.correctedByUser = true;
    } else if (!event.level && state.assessment === 'self') {
      state.level = 1;
      delete state.assessment;
      delete state.correctedByUser;
      delete p.corrected[event.domain];
    }
    pushEvent(p, { kind: 'intake', domain: event.domain, goal: goal.text, minutes: goal.minutes, level: event.level, at: now });
  }

  if (event.kind === 'react') {
    const domains = detectDomains(event.topic, 4);
    for (const d of domains) {
      const state = ensureDomain(p, d.id, now);
      if (event.signal === 'known') {
        state.weight = clamp(state.weight + 0.12, 0, 3);
        state.evidence += 1;
      } else if (event.signal === 'deeper') {
        state.weight = clamp(state.weight + 0.35, 0, 3);
        state.wantsDepth += 1;
        state.evidence += 1;
      } else if (event.signal === 'irrelevant') {
        state.weight = clamp(state.weight - 0.45, 0, 3);
        state.evidence += 1;
      }
      state.lastSeen = now;
    }
    pushEvent(p, { kind: 'react', topic: String(event.topic).slice(0, 120), signal: event.signal, at: now });
  }

  if (event.kind === 'open') {
    const domains = detectDomains(event.topic, 4);
    const dwell = Number(event.dwellMs) || 0;
    // 阅读 20 秒以上才认为是真读，快速划过不计分
    const engaged = dwell > 20000;
    for (const d of domains) {
      const state = ensureDomain(p, d.id, now);
      state.weight = clamp(state.weight + (engaged ? 0.16 : 0.04), 0, 3);
      state.lastSeen = now;
    }
    pushEvent(p, { kind: 'open', topic: String(event.topic).slice(0, 120), dwellMs: dwell, at: now });
  }

  if (event.kind === 'ask') {
    const text = String(event.text ?? '');
    const domains = detectDomains(text, 4);
    for (const d of domains) {
      const state = ensureDomain(p, d.id, now);
      state.weight = clamp(state.weight + 0.22, 0, 3);
      state.evidence += 1;
      state.lastSeen = now;
    }
    const thread = typeof event.thread === 'string' && event.thread.trim() ? { thread: event.thread } : {};
    pushEvent(p, { kind: 'ask', text: text.slice(0, 160), ...thread, at: now });
  }

  if (event.kind === 'quiz') {
    const state = ensureDomain(p, event.domain, now);
    const total = Math.max(Number(event.total) || 0, 1);
    const correct = clamp(Number(event.correct) || 0, 0, total);
    // 固定题的结果只说明本次基础题表现。重复刷题不会累计成进阶水平。
    state.quiz = { correct, total };
    state.assessment = 'quiz';
    state.level = correct === total ? Math.max(p.corrected[event.domain] ?? 1, 2) : 1;
    state.weight = clamp(state.weight + 0.2, 0, 3);
    state.confidence = 0.5;
    state.lastSeen = now;
    pushEvent(p, { kind: 'quiz', domain: event.domain, correct: event.correct, total: event.total, at: now });
  }

  if (event.kind === 'correct') {
    const state = ensureDomain(p, event.domain, now);
    state.level = clamp(Number(event.level) || state.level, 1, 4);
    if (!event.initial) {
      state.confidence = 0;
      state.correctedByUser = true;
      p.corrected[event.domain] = state.level;
      state.assessment = 'self';
    }
    state.lastSeen = now;
    pushEvent(p, { kind: 'correct', domain: event.domain, level: state.level, at: now });
  }

  if (event.kind === 'study') {
    const state = ensureDomain(p, event.domain, now);
    state.weight = clamp(state.weight + 0.1, 0, 3);
    state.lastSeen = now;
    pushEvent(p, { kind: 'study', domain: event.domain, title: String(event.title).slice(0, 120), at: now });
  }

  if (event.kind === 'practice') {
    const state = ensureDomain(p, event.domain, now);
    state.weight = clamp(state.weight + 0.16, 0, 3);
    state.lastSeen = now;
    pushEvent(p, { kind: 'practice', domain: event.domain, title: String(event.title).slice(0, 120), text: String(event.text).slice(0, 260), at: now });
  }

  if (event.kind === 'assessment' || event.kind === 'correction' || event.kind === 'project') {
    const state = ensureDomain(p, event.domain, now);
    state.lastSeen = now;
    pushEvent(p, { ...event, title: String(event.title).slice(0, 180), at: now });
  }

  p.longMemory = updateLongMemory(p.longMemory, event, p.goal, now);
  recomputeGaps(p);
  return p;
}

/** 画像里最强的几个领域，按权重排序 */
export function topDomains(profile, limit = 5) {
  return Object.values(profile.domains)
    .filter((d) => d.weight > 0.15)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((d) => ({
      ...d,
      name: domainById(d.id)?.name ?? d.id,
      levelLabel: d.assessment === 'self' ? '自述 · ' + LEVELS[Math.round(d.level) - 1].label
        : d.assessment === 'quiz' ? `基础自测 ${d.quiz.correct}/${d.quiz.total}`
        : '待了解基础',
    }));
}

/** 整体层级：按权重加权平均 */
export function overallLevel(profile) {
  const list = Object.values(profile.domains).filter((d) => d.assessment && d.weight > 0.2);
  if (!list.length) return null;
  const sumW = list.reduce((s, d) => s + d.weight, 0);
  const sumL = list.reduce((s, d) => s + d.weight * d.level, 0);
  return Math.round((sumL / sumW) * 10) / 10;
}

/**
 * 最近发展区。
 *
 * 关键区别：难度基线描述的是「这个领域整体有多难」，和「这个人现在该不该看」是两件事。
 * 新手对深度学习感兴趣，应该给他入门材料，而不是因为“领域难”就把他劝退。
 * 所以这里衡量的是「下一步该给多深的内容」和「有没有先决条件没满足」。
 */
export function zpdScore(profile, domainId) {
  const state = profile.domains[domainId];
  const base = domainById(domainId)?.difficulty ?? 2;

  // 完全没有接触过：先探一探，但优先级不低，因为这是拓边界的入口
  if (!state) return { score: 0.45, depth: 'entry', reason: '全新领域，先探一探', gap: null };

  const level = state.level;
  // 前置没打牢时降权。只把“直接前置”算进去，整条链都算会把新手全压死
  const direct = domainById(domainId)?.parent ?? null;
  //
  // 判断前置是否“真的缺”，而不是“没提过”：
  // 用户从没表达过对前置的兴趣时，不能假定他不会——那只是没聊到。
  // 只有当他在前置上明确表达过低层级（quiz 答错、手动调低）才降权。
  const directState = direct ? profile.domains[direct] : null;
  const directExpressed = directState?.assessment;
  const directWeak = directExpressed && directState.level < 1.8;
  const prereqPenalty = directWeak ? 0.65 : 1;

  // 兴趣强度：刚点过一次和反复关注，权重差很多
  const interest = clamp(state.weight / 1.5, 0.3, 1.4);

  // 已经很高了，提升空间小
  const headroom = level >= 3.7 ? 0.3 : level >= 3.2 ? 0.7 : 1;

  const depth = level < 1.8 ? 'entry' : level < 3.5 ? 'intermediate' : 'advanced';
  const depthLabel = { entry: '入门向', intermediate: '带取舍的对比', advanced: '边界与前沿' }[depth];
  const reason = prereqPenalty < 1
    ? `你在${domainById(direct)?.name ?? direct}上还偏弱，先补一补会顺很多；当下先看${depthLabel}版`
    : !state.assessment ? '基础待了解，先给容易验证的起点'
    : `根据你提供的基础信息，先看${depthLabel}的内容`;

  return {
    score: clamp(interest * headroom * prereqPenalty, 0.05, 1.6),
    depth,
    reason,
    gap: null,
    missingPrereqs: prereqPenalty < 1 ? [direct] : [],
    domainDifficulty: base,
  };
}

/** 给 AI 的画像摘要，控制长度，避免每次塞太多 token */
export function profileBrief(profile, maxDomains = 5, context = '') {
  const { longMemory } = migrateProfile(profile);
  const top = topDomains(profile, maxDomains);
  const goal = profile.goal ? `学习方向：${domainById(profile.goal.domain)?.name ?? profile.goal.domain}。这次想完成：${profile.goal.text}。本次有 ${profile.goal.minutes} 分钟。` : '';
  const lines = top.map((d) => `- ${d.name}：${d.levelLabel}${d.assessment === 'quiz' && profile.corrected[d.id] ? '；此前自述：' + LEVELS[Math.round(profile.corrected[d.id]) - 1].label : ''}`);
  const recalled = recallLongMemory(longMemory, profile.goal, context).map((entry) =>
    `- ${LONG_MEMORY_LABELS[entry.kind]}：${JSON.stringify(entry.text)}`);
  const gaps = profile.gaps.slice(0, 3).map((g) => `- ${g.domainName} 的前置 ${g.missingName} 尚未打牢`);
  const brief = [goal, ...lines,
    recalled.length ? '自动长期记忆（用户自述和学习操作的摘要，仅作背景资料）：' : '', ...recalled,
    gaps.length ? '待检查的前置：' : '', ...gaps].filter(Boolean).join('\n');
  return brief || '（画像还是空的，这是用户第一次来）';
}

