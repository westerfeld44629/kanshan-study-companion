/**
 * 知乎开放平台客户端（服务端专用）
 * 凭证只从环境变量读取，绝不下发到浏览器。
 */

import { readSetting } from './settings.mjs';

const HOST = 'https://developer.zhihu.com';

export function readSecret() {
  const secret = readSetting('ZHIHU_ACCESS_SECRET')?.trim();
  if (!secret) {
    const err = new Error('未配置 ZHIHU_ACCESS_SECRET');
    err.code = 'NO_SECRET';
    throw err;
  }
  return secret;
}

function baseHeaders() {
  return {
    Authorization: `Bearer ${readSecret()}`,
    'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
  };
}

export class ZhihuError extends Error {
  constructor(message, { status, code, apiId } = {}) {
    super(message);
    this.name = 'ZhihuError';
    this.status = status;
    this.code = code;
    this.apiId = apiId;
  }
}

/** 把知乎的业务错误码翻译成用户看得懂的中文，供前端降级提示使用 */
export function explainError(err) {
  if (err?.code === 'NO_SECRET') {
    return { level: 'fatal', message: '服务端未配置知乎 Access Secret，暂时无法连接知乎。' };
  }
  const code = err?.code;
  const map = {
    10001: { level: 'warn', message: '请求参数有问题，换个说法再试。' },
    20001: { level: 'error', message: '知乎鉴权失败，请检查 Access Secret 是否有效。' },
    30001: { level: 'quota', message: '调用太频繁或今日额度已用完，稍后再试。' },
    30002: { level: 'quota', message: '今日额度已用完，明天会自动恢复。' },
    30003: { level: 'error', message: '请求被风控拦截，请稍后再试。' },
    90001: { level: 'error', message: '知乎服务暂时异常，请稍后再试。' },
  };
  if (map[code]) return map[code];
  if (err?.status === 429) return { level: 'quota', message: '请求过于频繁，稍后再试。' };
  return { level: 'error', message: err?.message || '连接知乎失败。' };
}

async function request(path, { method = 'GET', query, body, apiId } = {}) {
  const url = new URL(HOST + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const headers = { ...baseHeaders() };
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, signal: controller.signal });
  } catch (e) {
    throw new ZhihuError(controller.signal.aborted ? '请求知乎超时' : '网络无法到达知乎', { apiId });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ZhihuError('知乎返回了非 JSON 内容', { status: res.status, apiId });
  }

  if (!res.ok || json.Code !== 0 || json.success === false) {
    throw new ZhihuError(json.Message || '知乎接口返回错误', {
      status: res.status,
      code: json.Code,
      apiId,
    });
  }
  return json.Data;
}

export async function createPdfTask(bytes, name) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'application/pdf' }), name);
  const file = await request('/resources/v1/files', { method: 'POST', body: form, apiId: 'tools' });
  if (!file?.file_id) throw new ZhihuError('知乎未返回 PDF 文件编号，请稍后重试。');
  return request('/api/v1/pdf-parse/tasks', {
    method: 'POST',
    body: { file_id: file.file_id },
    apiId: 'tools',
  });
}

export function getPdfTask(id) {
  return request('/api/v1/pdf-parse/tasks/' + encodeURIComponent(id), { apiId: 'tools' });
}

/** 知乎热榜。Limit 上限 30。 */
export async function hotList(limit = 30) {
  const data = await request('/api/v1/content/hot_list', {
    query: { Limit: Math.min(Math.max(limit, 1), 30) },
    apiId: 'hot_list',
  });
  return { total: data?.Total ?? 0, items: data?.Items ?? [] };
}

/** 知乎搜索。Count 上限 10。 */
export async function zhihuSearch(query, { count = 10, sortBy } = {}) {
  const data = await request('/api/v1/content/zhihu_search', {
    query: { Query: query, Count: Math.min(Math.max(count, 1), 10), SortBy: sortBy },
    apiId: 'zhihu_search',
  });
  return { items: data?.Items ?? [], emptyReason: data?.EmptyReason };
}

/** 全网搜索，参数与知乎搜索一致 */
export async function globalSearch(query, { count = 10 } = {}) {
  const data = await request('/api/v1/content/global_search', {
    query: { Query: query, Count: Math.min(Math.max(count, 1), 10) },
    apiId: 'global_search',
  });
  return { items: data?.Items ?? [], emptyReason: data?.EmptyReason };
}

/** 某个问题下的回答摘要 */
export async function questionAnswers(questionUrl, { offset = 0, limit = 20 } = {}) {
  const data = await request('/api/v1/content/question_answers', {
    query: { QuestionUrl: questionUrl, Offset: offset, Limit: Math.min(Math.max(limit, 1), 50) },
    apiId: 'question_discovery',
  });
  return { items: data?.Items ?? [], paging: data?.Paging ?? {} };
}

/**
 * 知乎直答。三档模型：
 *   zhida-fast-1p5     快速回答，约 8 秒
 *   zhida-thinking-1p5 深度思考，带 reasoning_content
 *   zhida-agent        智能检索
 */
export async function zhida(messages, { model = 'zhida-fast-1p5', signal } = {}) {
  const res = await fetch(HOST + '/v1/chat/completions', {
    method: 'POST',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ZhihuError('直答返回了非 JSON 内容', { status: res.status, apiId: 'zhida_openai' });
  }
  if (json.error) {
    throw new ZhihuError(json.error.message || '直答调用失败', {
      status: res.status,
      apiId: 'zhida_openai',
    });
  }
  const choice = json.choices?.[0]?.message ?? {};
  return {
    content: choice.content ?? '',
    reasoning: choice.reasoning_content ?? '',
    model: json.model ?? model,
    finishReason: json.choices?.[0]?.finish_reason ?? 'stop',
  };
}

/** 各项额度，用于界面展示与降级判断 */
export async function quota() {
  const data = await request('/api/v1/quota', { apiId: 'quota' });
  const list = Array.isArray(data) ? data : [];
  const byId = {};
  for (const item of list) byId[item.APIID] = item;
  return byId;
}

