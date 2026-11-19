/**
 * 领域词典与前置关系。
 * 作用有两个：把用户行为里的文本归到领域；知道领域之间的先后依赖。
 * 词典刻意做得小而准，覆盖学生与初入职场者最常见的知识域。
 */

/** 每个领域：关键词、父领域（用于缺口推断）、难度基线 */
export const DOMAINS = [
  { id: 'python', name: 'Python', keywords: ['python', 'py', 'pandas', 'numpy', 'django', 'flask', 'pip'], parent: 'programming', difficulty: 2 },
  { id: 'javascript', name: 'JavaScript', keywords: ['javascript', 'js', 'typescript', 'ts', 'node', 'nodejs', 'npm', 'react', 'vue'], parent: 'programming', difficulty: 2 },
  { id: 'programming', name: '编程基础', keywords: ['编程', '代码', '写代码', '程序', '算法', '数据结构', 'debug', '调错'], parent: null, difficulty: 1 },
  { id: 'frontend', name: '前端开发', keywords: ['前端', 'css', 'html', '浏览器', '页面', '响应式', '组件'], parent: 'javascript', difficulty: 3 },
  { id: 'backend', name: '后端与架构', keywords: ['后端', '服务端', '数据库', 'sql', 'api', '微服务', '并发', '缓存'], parent: 'programming', difficulty: 3 },
  { id: 'ml', name: '机器学习', keywords: ['机器学习', 'ml', 'sklearn', 'scikit', '回归', '分类', '特征工程', '交叉验证', '调参'], parent: 'python', difficulty: 3 },
  { id: 'dl', name: '深度学习', keywords: ['深度学习', '神经网络', 'cnn', 'rnn', 'transformer', '反向传播', '梯度', 'pytorch', 'tensorflow'], parent: 'ml', difficulty: 4 },
  { id: 'llm', name: '大模型与 Agent', keywords: ['大模型', 'llm', 'gpt', 'agent', '智能体', 'rag', '提示词', 'prompt', '微调', 'lora', '量化'], parent: 'dl', difficulty: 4 },
  { id: 'nlp', name: '自然语言处理', keywords: ['nlp', '自然语言', '分词', '词向量', '文本分类', '语义'], parent: 'dl', difficulty: 4 },
  { id: 'cv', name: '计算机视觉', keywords: ['cv', '计算机视觉', '图像', '目标检测', 'yolo', '分割', 'ocr'], parent: 'dl', difficulty: 4 },
  { id: 'data', name: '数据分析', keywords: ['数据分析', '数据可视化', '统计', '报表', 'excel', 'bi', '指标', 'ab测试'], parent: null, difficulty: 2 },
  { id: 'math', name: '数学基础', keywords: ['数学', '线性代数', '概率', '微积分', '矩阵', '导数', '统计推断'], parent: null, difficulty: 3 },
  { id: 'product', name: '产品思维', keywords: ['产品', '需求', 'prd', '用户画像', '迭代', '原型', '竞品'], parent: null, difficulty: 2 },
  { id: 'design', name: '设计', keywords: ['设计', 'ui', '交互', '排版', '配色', 'figma', '视觉'], parent: null, difficulty: 2 },
  { id: 'career', name: '求职与职场', keywords: ['求职', '面试', '简历', '校招', '实习', 'offer', '职场', '跳槽', '晋升'], parent: null, difficulty: 1 },
  { id: 'exam', name: '考研升学', keywords: ['考研', '保研', '复试', '初试', '留学', '申请', '雅思', '托福', 'gre'], parent: null, difficulty: 2 },
  { id: 'english', name: '英语', keywords: ['英语', 'english', '背单词', '口语', '听力', '阅读', '写作', '四级', '六级'], parent: null, difficulty: 1 },
  { id: 'writing', name: '写作表达', keywords: ['写作', '写作技巧', '文案', '表达', '汇报', '演讲', '总结'], parent: null, difficulty: 2 },
  { id: 'research', name: '科研与论文', keywords: ['科研', '论文', 'paper', '文献', 'arxiv', '综述', '实验设计', '投稿'], parent: null, difficulty: 3 },
  { id: 'finance', name: '财经理财', keywords: ['理财', '基金', '股票', '投资', '财经', '经济', '通胀', '利率'], parent: null, difficulty: 2 },
  { id: 'health', name: '健康运动', keywords: ['健身', '减肥', '跑步', '睡眠', '饮食', '健康', '运动', '锻炼'], parent: null, difficulty: 1 },
  { id: 'psych', name: '心理成长', keywords: ['心理', '焦虑', '情绪', '拖延', '自律', '专注', '内耗', '习惯'], parent: null, difficulty: 1 },
  { id: 'photography', name: '摄影', keywords: ['摄影', '相机', '镜头', '构图', '后期', '光圈'], parent: null, difficulty: 1 },
];

const BY_ID = new Map(DOMAINS.map((d) => [d.id, d]));

export function domainById(id) {
  return BY_ID.get(id) ?? null;
}

/** 从一段文本里抽取命中的领域，按命中关键词数量排序 */
export function detectDomains(text, limit = 5) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const hits = [];
  for (const d of DOMAINS) {
    let score = 0;
    let firstHit = Infinity;
    for (const kw of d.keywords) {
      if (kw.length <= 2) {
        // 短词要求词边界，避免 "cv" 命中 "cvs"、"ts" 命中 "arts"
        const re = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'g');
        const m = lower.match(re);
        if (m) { score += m.length; firstHit = Math.min(firstHit, lower.indexOf(kw)); }
      } else if (lower.includes(kw)) {
        score += 1;
        firstHit = Math.min(firstHit, lower.indexOf(kw));
      }
    }
    if (score > 0) hits.push({ id: d.id, name: d.name, score, firstHit });
  }
  // 命中强度优先；强度相同按在文本里出现的先后，符合“先提到的更重要”的直觉
  hits.sort((a, b) => b.score - a.score || a.firstHit - b.firstHit);
  return hits.slice(0, limit);
}

/** 沿 parent 链回溯，找出这个领域的前置领域 */
export function prerequisitesOf(domainId) {
  const chain = [];
  let cur = BY_ID.get(domainId)?.parent ?? null;
  while (cur) {
    chain.push(cur);
    cur = BY_ID.get(cur)?.parent ?? null;
  }
  return chain;
}

/** 语料里出现的高阶术语占比，用来粗估提问者的理解层级 */
const ADVANCED_TERMS = [
  '收敛', '泛化', '过拟合', '正则', '梯度', '损失函数', '分布式', '并发', '复杂度',
  '召回率', '精确率', '偏差', '方差', '量化', '推理', '吞吐', '延迟', '显存',
  '微调', '对齐', '蒸馏', '剪枝', '算子', '编译', '缓存命中', '幂等', '一致性',
];

export function termSophistication(text) {
  if (!text) return 0;
  const lower = String(text).toLowerCase();
  let hits = 0;
  for (const t of ADVANCED_TERMS) if (lower.includes(t)) hits += 1;
  // 0~1，命中 4 个以上视为满档
  return Math.min(hits / 4, 1);
}

