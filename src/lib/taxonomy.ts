/**
 * Primary-school mathematics curriculum taxonomy (2022 Chinese Math Curriculum Standards 义务教育数学课程标准):
 * normalizes free-form LLM or parent topic labels into the 4 canonical domains and standardizes school terms.
 */

export type MathDomain = "数与代数" | "图形与几何" | "统计与概率" | "综合与实践";

export const MATH_DOMAINS: readonly MathDomain[] = [
  "数与代数",
  "图形与几何",
  "统计与概率",
  "综合与实践",
];

export type Term = "上学期" | "下学期";

export const TERMS: readonly Term[] = ["上学期", "下学期"];

export const GRADES: readonly number[] = [1, 2, 3, 4, 5, 6];

const DOMAIN_ALIASES: Record<string, MathDomain> = {
  数与代数: "数与代数",
  数与计算: "数与代数",
  数的运算: "数与代数",
  数的认识: "数与代数",
  常见的量: "数与代数",
  式与方程: "数与代数",
  比和比例: "数与代数",
  数量关系: "数与代数",
  图形与几何: "图形与几何",
  空间与图形: "图形与几何",
  几何与图形: "图形与几何",
  图形认识: "图形与几何",
  图形的认识与测量: "图形与几何",
  图形的位置与运动: "图形与几何",
  几何: "图形与几何",
  统计与概率: "统计与概率",
  统计与可能性: "统计与概率",
  统计: "统计与概率",
  概率: "统计与概率",
  数据的收集与整理: "统计与概率",
  综合与实践: "综合与实践",
  实践与综合应用: "综合与实践",
  数学广角: "综合与实践",
  思维拓展: "综合与实践",
};

const STATS_KEYWORDS = [
  "统计",
  "平均数",
  "条形",
  "折线",
  "扇形统计",
  "复式",
  "可能性",
  "可能",
  "概率",
  "随机",
  "数据收集",
  "数据整理",
];

const PRACTICE_KEYWORDS = [
  "植树",
  "鸡兔",
  "烙饼",
  "沏茶",
  "搭配",
  "推理",
  "逻辑",
  "集合",
  "重叠",
  "容斥",
  "优化",
  "统筹",
  "找次品",
  "鸽巢",
  "抽屉",
  "数学广角",
  "数字编码",
  "方阵",
  "周期问题",
  "年龄问题",
  "盈亏",
  "还原问题",
];

const GEOMETRY_KEYWORDS = [
  "面积",
  "周长",
  "表面积",
  "体积",
  "容积",
  "图形",
  "几何",
  "长方形",
  "正方形",
  "三角形",
  "平行四边形",
  "梯形",
  "多边形",
  "四边形",
  "长方体",
  "正方体",
  "圆柱",
  "圆锥",
  "扇形",
  "圆",
  "半径",
  "直径",
  "棱长",
  "线段",
  "射线",
  "直线",
  "平行",
  "垂直",
  "相交",
  "平移",
  "旋转",
  "对称",
  "观察物体",
  "三视图",
  "视图",
  "展开图",
  "数对",
  "方向与位置",
  "位置与方向",
  "东偏",
  "西偏",
  "南偏",
  "北偏",
];

function inferDomainFromText(text: string): MathDomain {
  const s = text.trim();
  if (!s) return "数与代数";

  // Check statistics first so "扇形统计图" classifies under 统计与概率 rather than 图形与几何 ("扇形").
  if (STATS_KEYWORDS.some((kw) => s.includes(kw))) {
    return "统计与概率";
  }

  if (PRACTICE_KEYWORDS.some((kw) => s.includes(kw))) {
    return "综合与实践";
  }

  // Guard money units ("元角分", "人民币") and classroom corners ("图书角") before matching geometry "角"/"圆".
  const isMoneyContext = /人民币|元角|角分|付钱|找零/.test(s);
  if (!isMoneyContext) {
    if (GEOMETRY_KEYWORDS.some((kw) => s.includes(kw))) {
      return "图形与几何";
    }
    if (s.includes("角") && !s.includes("图书角") && !s.includes("角色")) {
      return "图形与几何";
    }
  }

  return "数与代数";
}

/**
 * Normalizes any raw category/topic string into `{ domain, topic, full: "${domain}/${topic}" }`.
 */
export function normalizeCategory(raw?: string | null): {
  domain: MathDomain;
  topic: string;
  full: string;
} {
  const cleaned = String(raw ?? "")
    .replace(/／/g, "/")
    .replace(/\s*[>＞]\s*/g, "/")
    .trim();

  if (!cleaned || cleaned === "未分类") {
    return { domain: "数与代数", topic: "综合应用", full: "数与代数/综合应用" };
  }

  const parts = cleaned
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const firstAlias = DOMAIN_ALIASES[parts[0]];
    if (firstAlias) {
      // Strip duplicate leading domain segments if present (e.g. "数与代数/数与代数/口算")
      const rest = parts.slice(1).filter((p, idx) => !(idx === 0 && DOMAIN_ALIASES[p] === firstAlias));
      const topic = rest.join("·").trim() || "综合应用";
      return { domain: firstAlias, topic, full: `${firstAlias}/${topic}` };
    }
    const domain = inferDomainFromText(cleaned);
    const topic = parts.join("·").trim() || "综合应用";
    return { domain, topic, full: `${domain}/${topic}` };
  }

  const single = parts[0] ?? cleaned;
  const directDomain = DOMAIN_ALIASES[single];
  if (directDomain) {
    // If raw was e.g. "数学广角", preserve "数学广角" as topic unless it is literally one of the 4 domain names
    const isExactDomain = (MATH_DOMAINS as readonly string[]).includes(single);
    const topic = isExactDomain ? "综合应用" : single;
    return { domain: directDomain, topic, full: `${directDomain}/${topic}` };
  }

  const domain = inferDomainFromText(single);
  return { domain, topic: single, full: `${domain}/${single}` };
}

export function extractDomain(category?: string | null): MathDomain {
  return normalizeCategory(category).domain;
}

export function normalizeTerm(raw?: string | null): Term | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === "UP" || s === "上" || s === "上册" || s === "上学期" || s === "第一学期") {
    return "上学期";
  }
  if (upper === "DOWN" || s === "下" || s === "下册" || s === "下学期" || s === "第二学期") {
    return "下学期";
  }
  return null;
}
