import { detectDomains } from './domain.mjs';

const LIMITS = {
  preference: 12, clarification: 12, blocker: 16, assessment: 16,
  review: 40, correction: 16, project: 8, study: 12,
};
const RECALL_PRIORITY = {
  preference: 4, blocker: 4, review: 4, clarification: 3, project: 2, assessment: 1, correction: 1, study: 0,
};

export const LONG_MEMORY_LABELS = {
  preference: '长期偏好', clarification: '用户更正', blocker: '自述卡点',
  assessment: '阶段测评', review: '待订正知识点', correction: '已订正记录',
  project: '本人确认的实战成果', study: '本人标记的阅读进度',
};

function compact(value, limit = 120) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\s\p{Cf}]+/gu, ' ').trim();
  if (/(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b1[3-9]\d{9}\b|\b[a-f0-9]{32,}\b|\b(?:sk-|ghp_|github_pat_|AKIA)[\w-]{8,}|(?:口令|密码|密钥|验证码|身份证|api.?key|token|password)\s*(?:是|为|[:：=＝]))/iu.test(text.normalize('NFKC'))) return '';
  return Array.from(text).slice(0, limit).join('');
}

function key(...parts) {
  return JSON.stringify(parts);
}

function normalized(value = '') {
  return value.toLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function terms(text = '') {
  const filler = /(?:怎么|如何|什么|为什么|帮我|我想|学习|讲解|现在|时候|知识点)/g;
  return new Set((text.toLowerCase().replace(filler, ' ').match(/[a-z][a-z0-9]{2,}|\p{Script=Han}{3,}/gu) ?? [])
    .flatMap((word) => /[a-z]/.test(word) ? [word]
      : Array.from({ length: word.length - 2 }, (_, index) => word.slice(index, index + 3))));
}

function sameTopic(left, right) {
  if (!left || !right) return false;
  const leftTerms = terms(left);
  return [...terms(right)].some((term) => leftTerms.has(term));
}

// Plan steps currently use <plan id>-<step>, with an optional assessment edition suffix.
export function lessonPlanId(lesson) {
  return /^([0-9a-f]{20})-\d+(?::expanded)?$/i.exec(lesson ?? '')?.[1];
}

function threadTitle(thread) {
  if (!thread.startsWith('[') || thread.length > 8192) return '';
  try {
    const value = JSON.parse(thread);
    return Array.isArray(value) ? compact(value[0], 180) : '';
  } catch {
    return '';
  }
}

function goalScope(goal, domain) {
  const text = goal?.domain === domain ? compact(goal.text, 180) : '';
  return text ? { goal: text } : {};
}

function remember(records, entry) {
  const next = records.filter((record) => record.id !== entry.id);
  // Newest first. Limit each kind independently so frequent reads cannot evict preferences or reviews.
  next.unshift(entry);
  let kept = 0;
  return next.filter((record) => record.kind !== entry.kind || ++kept <= LIMITS[entry.kind]);
}

function preferenceSlot(text) {
  if (/^先.*(?:例子|示例|案例|原理|概念|结论|代码)/.test(text)) return 'opening';
  if (/^(?:简短|简洁|详细|少啰嗦|长一点|短一点|展开讲)/.test(text)) return 'length';
  if (/^(?:只用|用)(?:中文|英文)|^中英双语/.test(text)) return 'language';
  return normalized(text);
}

const PREF = /^(?:(?:以后的?讲解|以后(?:的)?学习|接下来(?:的)?学习|以后(?:每次(?:讲解)?)?|今后|往后|每次(?:讲解)?|之后每次|后续(?:讲解)?|长期)(?:都)?[，,：:\s]*(?:我(?:都)?(?:更)?(?:喜欢|偏好|希望|习惯|需要)|希望|请|都要|尽量|(?=先|只用|不要|用(?:中文|英文)|简短|简洁|详细|按(?:步骤|例子)))|我(?:一直|通常|一向)(?:更)?(?:喜欢|偏好|习惯)|我(?:更)?偏好|我希望(?:你)?(?:以后|今后|每次)(?:都)?|我的学习偏好(?:是|[:：]))\s*/;
const PREF_SCOPE = /^(?:在(?:学习)?|学(?:习)?|讲(?:解)?)([^，,:：]{1,26}?)(?:的时候|时)[，,:：]?\s*/;
const CORRECTION = /^(?:更正一下|更正|纠正一下|更新一下(?:我的)?(?:背景|情况)|我的情况是|你(?:之前|刚才)?理解错了)[，,：:\s]+/;
const BLOCKER = /^(?:(?:我(?:现在|目前|还是|一直|总是?)?|目前|现在|一直)?(?:卡在|没搞懂|没弄懂|没理解|还不懂|还不会|不理解|分不清)|(?:我的)?(?:卡点|难点)(?:是|[:：]))\s*/;
const RESOLVED = /^(?:我)?(?:现在|已经|终于)?(?:弄懂了|搞懂了|学会了|解决了|理解了)\s*/;
const CHAT_SIGNALS = [[PREF, 'preference'], [CORRECTION, 'clarification'], [BLOCKER, 'blocker'], [RESOLVED, 'resolved']];

function clarificationSlot(text) {
  if (/(?:熟悉|学过|会写|只会|初学者|刚入门|有基础|没基础|经验)/.test(text)) return 'background';
  if (/(?:我的目标|我想学|我想做|我需要学)/.test(text)) return 'focus';
  return 'general';
}

function updateFromChat(records, event, goal, at) {
  const { thread } = event;
  if (typeof thread !== 'string' || !thread.trim() || typeof event.text !== 'string') return records;
  if (/^\s*(?:[>“"「『`]|假设|如果|(?:请)?翻译)|```/u.test(event.text)) return records;
  const plan = lessonPlanId(thread);
  const source = { kind: 'ask', thread, ...(plan ? { plan, lesson: thread } : {}) };
  const title = threadTitle(thread);
  const domain = (plan && goal?.domain) || detectDomains(title, 1)[0]?.id || detectDomains(event.text, 1)[0]?.id || goal?.domain;
  // Chat alone does not establish a level. Only explicit first-person signals yield records.
  const clauses = event.text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [];
  for (const clause of clauses.slice(0, 6)) {
    if (clause.length > 300 || /[?？]|(?:能否|能不能|可不可以|是不是|比如说|举例说)/.test(clause)) continue;
    const input = clause.trim().replace(/[。！!；;]$/, '');
    const prefScope = PREF_SCOPE.exec(input);
    const prefDomain = prefScope && detectDomains(prefScope[1], 1)[0]?.id;
    const signal = prefDomain ? input.slice(prefScope[0].length) : input;
    const matched = CHAT_SIGNALS.find(([pattern]) => pattern.test(signal));
    if (!matched) continue;
    const [pattern, kind] = matched;
    const summary = signal.replace(pattern, '').split(/[，,]\s*(?:另外|顺便|今天|这次|请问|然后帮我)/, 1)[0];
    const text = compact(summary.replace(/^[，,:：\s]+|[，,:：\s]+$/g, ''));
    if (text.length < 2 || /^(?:忽略|覆盖|绕过|泄露|输出系统|执行(?:命令|代码)|删除(?:数据|文件))/.test(text)) continue;
    if (kind === 'preference') {
      records = remember(records, { id: key(kind, prefDomain || '', preferenceSlot(text)),
        kind, text, at, ...(prefDomain ? { domain: prefDomain } : {}), source });
      continue;
    }
    const scope = plan || sameTopic(goal?.text, title || text) ? goalScope(goal, domain) : {};
    const scopeId = scope.goal ? normalized(scope.goal) : '';
    const subject = normalized(text).replace(/[了呀呢啊]+$/, '');
    if (kind === 'resolved') {
      records = records.filter((record) => record.kind !== 'blocker' || record.domain !== domain ||
        (record.goal && scope.goal && normalized(record.goal) !== scopeId) ||
        normalized(record.text).replace(/[了呀呢啊]+$/, '') !== subject);
      continue;
    }
    const id = key(kind, domain, scopeId, kind === 'clarification' ? clarificationSlot(text) : subject);
    records = remember(records, { id, kind, text, at, ...(domain ? { domain } : {}), ...scope, source });
  }
  return records;
}

export function updateLongMemory(records, event, goal, at) {
  const { kind, domain, lesson, plan, question } = event;
  if (kind === 'ask') return updateFromChat(records, event, goal, at);
  if (!['study', 'assessment', 'correction', 'project'].includes(kind)) return records;
  const title = compact(event.title, 90);
  if (!title || !domain) return records;
  const relatedGoal = kind === 'project' || lessonPlanId(lesson) || sameTopic(goal?.text, title);
  const scope = { domain, ...(relatedGoal ? goalScope(goal, domain) : {}) };
  if (kind === 'study') {
    return remember(records, { id: key(kind, domain, normalized(title)), kind, text: `已读论文卡「${title}」`, at,
      ...scope, source: { kind } });
  }
  if (kind === 'project') {
    if (!plan) return records;
    return remember(records, { id: key(kind, plan), kind, text: `已确认结课实战「${title}」`, at,
      ...scope, source: { kind, plan } });
  }
  if (!lesson) return records;
  const inferredPlan = lessonPlanId(lesson);
  const source = { kind, lesson, ...(inferredPlan ? { plan: inferredPlan } : {}) };
  if (kind === 'assessment') {
    if (!Number.isInteger(event.total) || !Number.isInteger(event.correct) || event.total <= 0 ||
        event.correct < 0 || event.correct > event.total) return records;
    records = records.filter((record) => record.source.lesson !== lesson || !['review', 'correction'].includes(record.kind));
    const score = `${event.correct}/${event.total}`;
    records = remember(records, { id: key(kind, lesson), kind, text: `「${title}」已交卷，得分 ${score}`, at, ...scope, source });
    for (const item of (Array.isArray(event.review) ? event.review : []).slice(0, 12)) {
      const concept = compact(item?.concept, 65);
      if (!concept || !item.question) continue;
      records = remember(records, { id: key('review', lesson, item.question), kind: 'review',
        text: `「${title}」待订正：${concept}`, at, ...scope, source: { ...source, question: item.question } });
    }
    return records;
  }
  if (!question) return records;
  const reviewId = key('review', lesson, question);
  const review = records.find((record) => record.id === reviewId);
  const concept = compact(event.concept, 65);
  return remember(records.filter((record) => record.id !== reviewId), {
    id: key(kind, lesson, question), kind, text: `「${title}」已订正${concept ? `：${concept}` : ''}`, at,
    ...scope, ...(review?.goal ? { goal: review.goal } : {}), source: { ...source, question },
  });
}

export function backfillLongMemory(events = []) {
  let records = [];
  let goal = null;
  for (const event of events.slice(-300)) {
    if (event.kind === 'intake') goal = { text: event.goal, domain: event.domain };
    // Historical messages can be truncated and lack their original scope.
    if (event.kind !== 'ask') records = updateLongMemory(records, event, goal, event.at);
  }
  return records;
}

export function recallLongMemory(records, goal, context) {
  const contextDomains = new Set(detectDomains(context, 2).map(({ id }) => id));
  const activeGoal = goal?.text && (!context || sameTopic(goal.text, context) || normalized(goal.text) === normalized(context));
  if (activeGoal) contextDomains.add(goal.domain);
  const ranked = records.flatMap((record) => {
    if (record.kind === 'preference' && !record.domain) return [];
    const goalMatch = record.goal && ((activeGoal && normalized(record.goal) === normalized(goal.text)) || sameTopic(record.goal, context));
    const domainMatch = contextDomains.has(record.domain);
    const textMatch = sameTopic(record.text, context);
    if (!goalMatch && !domainMatch && !textMatch) return [];
    return [{ record, score: Number(Boolean(goalMatch)) * 6 + Number(textMatch) * 4 + Number(domainMatch) * 3 + RECALL_PRIORITY[record.kind] }];
  }).sort((left, right) => right.score - left.score || right.record.at - left.record.at);
  const preferences = records.filter((record) => record.kind === 'preference' && !record.domain).slice(0, ranked.length ? 1 : 2);
  const picked = new Map();
  for (const { record } of ranked) {
    const category = record.source.lesson ?? record.kind;
    const count = picked.get(category) ?? 0;
    if (count >= 2) continue;
    preferences.push(record);
    picked.set(category, count + 1);
    if (preferences.length === 4) break;
  }
  return preferences;
}
