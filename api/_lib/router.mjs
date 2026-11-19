/**
 * 路由表：本地 node 服务与 Vercel Functions 共用同一份处理逻辑，
 * 避免“本地能跑、线上不通”的经典问题。
 */

import { hotList, questionAnswers, zhida, explainError, ZhihuError } from './zhihu.mjs';
import { generate, aiStatus } from './ai.mjs';
import { LEVEL_QUIZ, offlineLearningPlan } from './content.mjs';
import { detectDomains } from '../../shared/domain.mjs';
import { emptyProfile, migrateProfile, topDomains, zpdScore } from '../../shared/profile.mjs';
import { cleanMaterials, isZhihu, sourceLearningSheet, studyRoute } from '../../shared/learning.mjs';
import { buildCoachPrompt, buildBriefPrompt, buildSourcePrompt } from './prompts.mjs';
import { recommendFor, buildQueries } from './recommend.mjs';
import { PaperError, explainPaper, paperStatus, submitPaper } from './paper.mjs';
import { searchCached, searchExternal } from './search.mjs';
import { makeAssessment, makeStudyPlan } from './study.mjs';
import { API_CONTRACT } from '../../shared/api-contract.mjs';

const cache = new Map();
const TTL = { hot: 30 * 60 * 1000, search: 60 * 60 * 1000 };

function getCache(k) {
  const v = cache.get(k);
  if (v && Date.now() - v.at < v.ttl) return v.data;
  cache.delete(k);
  return null;
}

function setCache(k, data, ttl) {
  cache.set(k, { at: Date.now(), data, ttl });
  if (cache.size > 500) {
    for (const key of cache.keys()) {
      cache.delete(key);
      if (cache.size <= 400) break;
    }
  }
}

async function loadAnswers(url, limit = 15) {
  const key = 'ans:' + url;
  const cached = getCache(key);
  if (cached) return cached;
  const data = await questionAnswers(url, { limit });
  setCache(key, data, TTL.search);
  return data;
}

async function expandTopic(input, intent) {
  if (typeof input?.title !== 'string' || !input.title.trim()) return null;
  const title = input.title.trim().slice(0, 180);
  let materials = cleanMaterials(input.materials);
  const hot = materials.find((item) => item.source === 'hot');
  if (intent === 'start' && hot?.url && isZhihu(hot.url) && /\/question\/\d+/.test(hot.url)) {
    try {
      const answers = await loadAnswers(hot.url);
      materials = cleanMaterials([...materials, ...answers.items.slice(0, 3).map((answer, i) => ({
        title: answer.AuthorName ? answer.AuthorName + '的回答' : `知乎回答 ${i + 1}`,
        source: 'zhihu', url: answer.Url, excerpt: answer.Summary ?? answer.ContentText,
      }))]);
    } catch {
      // 热榜自带的摘要仍可用于学习
    }
  }
  return {
    title, materials,
    lessonId: typeof input.lessonId === 'string' ? input.lessonId.slice(0, 80) : undefined,
    domain: typeof input.domain === 'string' ? input.domain.slice(0, 30) : undefined,
    objective: typeof input.objective === 'string' ? input.objective.slice(0, 320) : undefined,
    stageDepth: ['entry', 'intermediate', 'advanced'].includes(input.stageDepth) ? input.stageDepth : undefined,
  };
}

function json(status, body) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function fail(e) {
  const info = explainError(e);
  const status = info.level === 'fatal' ? 500 : info.level === 'quota' ? 429 : 502;
  return json(status, { ok: false, error: info.message, level: info.level });
}

/** 把热榜条目按画像相关度重排，而不是纯按热度 */
function rankHotItems(items, profile) {
  if (!profile || !Object.keys(profile.domains ?? {}).length) return items;
  return items
    .map((it, idx) => {
      const text = (it.Title ?? '') + ' ' + (it.Summary ?? '');
      const doms = detectDomains(text, 3);
      let score = 0;
      let reason = '';
      for (const d of doms) {
        const state = profile.domains[d.id];
        if (!state) continue;
        const z = zpdScore(profile, d.id);
        score += state.weight * z.score;
        if (z.score > 0.6) reason = z.reason;
      }
      // 原顺序作为一个很小的先验，避免完全无序
      return { item: it, score, reason, doms: doms.map((d) => d.name), order: idx };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x, i) => ({ ...x.item, _affinity: Math.round(x.score * 100) / 100, _reason: x.reason, _domains: x.doms, _rank: i + 1 }));
}

export async function handle(route, { query = {}, body = {}, method, localPdfUpload = false } = {}) {
  try {
    switch (route) {
      case 'study': {
        if (method !== 'POST') return json(405, { ok: false, error: '此学习操作需要 POST。' });
        const profile = migrateProfile(body.profile);
        if (body.action === 'plan' && profile.goal?.text) return json(200, { ok: true, plan: await makeStudyPlan(profile) });
        if (body.action === 'assessment') {
          const topic = await expandTopic(body.topic, 'assessment');
          if (!topic) return json(400, { ok: false, error: '请选择要测评的课程。' });
          const assessment = await makeAssessment({ topic, profile, lesson: body.lesson });
          return assessment ? json(200, { ok: true, assessment })
            : json(422, { ok: false, error: topic.materials.some((item) => item.source === 'paper')
              ? '这次未能生成满 10 道有出处的论文题。可重试，或重新读取含正文的论文。'
              : '现有正文不足以出一份有依据的测评。请补充有正文的资料后再试。' });
        }
        return json(400, { ok: false, error: '请先填写一个学习目标。' });
      }
      case 'pdf': {
        if (method === 'GET') return json(200, { ok: true, ...await paperStatus(query.token) });
        if (method === 'POST') {
          const result = body.action === 'explain' ? await explainPaper(body) : await submitPaper(body);
          return json(body.action === 'explain' ? 200 : 202, { ok: true, ...result });
        }
        return json(405, { ok: false, error: '不支持此请求方式。' });
      }
      case 'hot': {
        const limit = Number(query.limit) || 30;
        const key = 'hot:' + limit;
        let data = getCache(key);
        if (!data) {
          data = await hotList(limit);
          setCache(key, data, TTL.hot);
        }
        const profile = body.profile ? migrateProfile(body.profile) : null;
        return json(200, { ok: true, ...data, items: rankHotItems(data.items, profile) });
      }

      case 'answers': {
        const url = query.url;
        if (!url) return json(400, { ok: false, error: '缺少问题链接' });
        const data = await loadAnswers(url, Number(query.limit) || 15);
        return json(200, { ok: true, ...data });
      }

      case 'search': {
        const q = (query.q ?? '').trim();
        if (!q) return json(400, { ok: false, error: '请输入要搜索的内容' });
        const mode = query.mode === 'global' ? 'global' : 'zhihu';
        const data = mode === 'global' && String(query.external) === '1'
          ? await searchExternal(q.slice(0, 200)) : await searchCached(q.slice(0, 200), mode);
        return json(200, { ok: true, mode, query: q, ...data });
      }

      case 'quiz': {
        const domain = query.domain;
        const list = LEVEL_QUIZ[domain];
        if (!list) return json(404, { ok: false, error: '这个领域还没有诊断题' });
        return json(200, { ok: true, domain, questions: list });
      }

      case 'coach': {
        const profile = body.profile ? migrateProfile(body.profile) : emptyProfile();
        const { plan, history, intent } = body;
        const question = typeof body.question === 'string' ? body.question.trim().slice(0, 4000) : '';
        const topic = await expandTopic(body.topic, intent);
        if (!question && !plan && !topic) return json(400, { ok: false, error: '缺少问题' });
        const route = topic ? studyRoute(profile, topic.title, topic.materials, topic.domain, topic.stageDepth) : null;
        const messages = topic ? buildSourcePrompt(profile, topic, route, intent === 'start' ? '' : question, history, intent)
          : plan ? buildBriefPrompt(profile) : buildCoachPrompt(profile, question, history);
        const r = await generate(messages, { model: plan ? 'zhida-thinking-1p5' : 'zhida-fast-1p5' });
        if (!r.ok || !r.content?.trim()) {
          const fallback = !topic ? offlineLearningPlan(topDomains(profile, 3))
            : (question && intent !== 'start') ? `## 回到你这次的输入\n\n${question}\n\n目前无法自动讲解。可以对照「${route.title}」逐项自查：${route.rubric}\n\n再回到上方资料找一句支持你的原文，写下仍不确定的地方。`
            : sourceLearningSheet(topic.title, topic.materials, profile, route);
          return json(200, {
            ok: true,
            degraded: true,
            reason: r.reason,
            content: fallback,
            topic,
            route,
          });
        }
        return json(200, { ok: true, content: r.content, topic, route, cached: r.cached, ai: aiStatus() });
      }

      case 'zhida': {
        const { messages, model } = body;
        if (!Array.isArray(messages) || !messages.length) return json(400, { ok: false, error: '缺少对话内容' });
        const r = await zhida(messages, { model: model || 'zhida-fast-1p5' });
        return json(200, { ok: true, ...r });
      }

      case 'status': {
        return json(200, { ok: true, ai: aiStatus(), localPdfUpload, contract: API_CONTRACT });
      }

      case 'recommend': {
        const profile = migrateProfile(body.profile);
        if (!profile || !Object.keys(profile.domains ?? {}).length) {
          return json(200, { ok: true, items: [], tasks: [], reason: '画像为空，先点几下热榜上的话题' });
        }
        const tasks = buildQueries(profile);
        const cacheKey = 'rec:' + tasks.map((t) => t.query).join('|');
        let rec = getCache(cacheKey);
        if (!rec) {
          rec = await recommendFor(profile);
          setCache(cacheKey, rec, TTL.search);
        }
        return json(200, { ok: true, ...rec });
      }

      default:
        return json(404, { ok: false, error: '未知接口: ' + route });
    }
  } catch (e) {
    if (e instanceof PaperError) return json(e.status, { ok: false, error: e.message });
    if (e instanceof ZhihuError || e?.code) return fail(e);
    return json(500, { ok: false, error: e?.message ?? '服务内部错误' });
  }
}

