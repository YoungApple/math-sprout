/**
 * Pure primary-school math answer parser, unit-dimension-aware equivalence checker,
 * and deterministic S12 expression verifier (exact BigInt rationals, zero external deps).
 */

export interface Rational {
  readonly num: bigint;
  readonly den: bigint; // always > 0n, reduced by gcd
}

export interface UnitInfo {
  readonly dimension: string;
  readonly canonical: string;
  readonly scaleNum: bigint;
  readonly scaleDen: bigint;
  readonly discrete: boolean;
}

export type ParsedAnswer =
  | { kind: "rational"; value: Rational; unit: UnitInfo | null; rawUnit: string }
  | { kind: "qr"; quotient: bigint; remainder: bigint; qUnit: UnitInfo | null; rUnit: UnitInfo | null }
  | { kind: "ratio"; parts: Rational[] }
  | { kind: "tuple"; items: ParsedAnswer[] }
  | { kind: "text"; normalized: string };

export interface DiagnosedVariantLike {
  level: string;
  stem: string;
  answer: string;
  answer_expr?: string;
  explanation: string;
}

export interface DiagnosisMathInput {
  correct_answer: string;
  correct_expr?: string;
  variants: DiagnosedVariantLike[];
}

export interface MathVerificationWarning {
  target: string;
  reason: string;
  repairedFrom?: string;
  repairedTo?: string;
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function makeRational(num: bigint, den: bigint = 1n): Rational | null {
  if (den === 0n) return null;
  const sign = den < 0n ? -1n : 1n;
  const n = num * sign;
  const d = den * sign;
  const g = gcdBigInt(n, d);
  return { num: n / g, den: d / g };
}

export function rationalEquals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

function rationalAdd(a: Rational, b: Rational): Rational {
  return makeRational(a.num * b.den + b.num * a.den, a.den * b.den)!;
}

function rationalSub(a: Rational, b: Rational): Rational {
  return makeRational(a.num * b.den - b.num * a.den, a.den * b.den)!;
}

function rationalMul(a: Rational, b: Rational): Rational {
  return makeRational(a.num * b.num, a.den * b.den)!;
}

function rationalDiv(a: Rational, b: Rational): Rational | null {
  if (b.num === 0n) return null;
  return makeRational(a.num * b.den, a.den * b.num);
}

export function formatRational(r: Rational, preferDecimal = false): string {
  if (r.den === 1n) return r.num.toString();
  if (preferDecimal) {
    // Check if denominator only has factors of 2 and 5 (terminating decimal)
    let d = r.den;
    let twos = 0;
    let fives = 0;
    while (d % 2n === 0n) { d /= 2n; twos++; }
    while (d % 5n === 0n) { d /= 5n; fives++; }
    if (d === 1n && Math.max(twos, fives) <= 6) {
      const k = Math.max(twos, fives);
      const factor = (2n ** BigInt(k - twos)) * (5n ** BigInt(k - fives));
      const scaled = r.num * factor;
      const neg = scaled < 0n ? "-" : "";
      const absStr = (scaled < 0n ? -scaled : scaled).toString().padStart(k + 1, "0");
      const intPart = absStr.slice(0, absStr.length - k);
      const fracPart = absStr.slice(absStr.length - k).replace(/0+$/, "");
      return fracPart ? `${neg}${intPart}.${fracPart}` : `${neg}${intPart}`;
    }
  }
  return `${r.num.toString()}/${r.den.toString()}`;
}

interface RawUnitSpec {
  aliases: string[];
  dimension: string;
  canonical: string;
  scaleNum: bigint;
  scaleDen?: bigint;
  discrete?: boolean;
}

const UNIT_SPECS: RawUnitSpec[] = [
  // Length (base: mm)
  { aliases: ["毫米", "mm"], dimension: "length", canonical: "毫米", scaleNum: 1n },
  { aliases: ["厘米", "公分", "cm"], dimension: "length", canonical: "厘米", scaleNum: 10n },
  { aliases: ["分米", "dm"], dimension: "length", canonical: "分米", scaleNum: 100n },
  { aliases: ["米", "m"], dimension: "length", canonical: "米", scaleNum: 1000n },
  { aliases: ["千米", "公里", "km"], dimension: "length", canonical: "千米", scaleNum: 1_000_000n },

  // Area (base: mm^2)
  { aliases: ["平方毫米", "mm²", "mm2"], dimension: "area", canonical: "平方毫米", scaleNum: 1n },
  { aliases: ["平方厘米", "cm²", "cm2"], dimension: "area", canonical: "平方厘米", scaleNum: 100n },
  { aliases: ["平方分米", "dm²", "dm2"], dimension: "area", canonical: "平方分米", scaleNum: 10_000n },
  { aliases: ["平方米", "m²", "m2"], dimension: "area", canonical: "平方米", scaleNum: 1_000_000n },
  { aliases: ["公顷", "ha"], dimension: "area", canonical: "公顷", scaleNum: 10_000_000_000n },
  { aliases: ["平方千米", "平方公里", "km²", "km2"], dimension: "area", canonical: "平方千米", scaleNum: 1_000_000_000_000n },

  // Volume & Capacity (base: mm^3; 1 mL = 1 cm^3 = 1000 mm^3, 1 L = 1 dm^3 = 1_000_000 mm^3)
  { aliases: ["立方毫米", "mm³", "mm3"], dimension: "volume", canonical: "立方毫米", scaleNum: 1n },
  { aliases: ["立方厘米", "毫升", "cm³", "cm3", "ml"], dimension: "volume", canonical: "毫升", scaleNum: 1000n },
  { aliases: ["立方分米", "升", "dm³", "dm3", "l"], dimension: "volume", canonical: "升", scaleNum: 1_000_000n },
  { aliases: ["立方米", "m³", "m3"], dimension: "volume", canonical: "立方米", scaleNum: 1_000_000_000n },

  // Mass (base: mg)
  { aliases: ["毫克", "mg"], dimension: "mass", canonical: "毫克", scaleNum: 1n },
  { aliases: ["克", "g"], dimension: "mass", canonical: "克", scaleNum: 1000n },
  { aliases: ["斤"], dimension: "mass", canonical: "斤", scaleNum: 500_000n },
  { aliases: ["千克", "公斤", "kg"], dimension: "mass", canonical: "千克", scaleNum: 1_000_000n },
  { aliases: ["吨", "t"], dimension: "mass", canonical: "吨", scaleNum: 1_000_000_000n },

  // Time (base: second)
  { aliases: ["秒钟", "秒", "s"], dimension: "time", canonical: "秒", scaleNum: 1n },
  { aliases: ["分钟", "分", "min"], dimension: "time", canonical: "分钟", scaleNum: 60n },
  { aliases: ["小时", "时", "h", "hr"], dimension: "time", canonical: "小时", scaleNum: 3600n },
  { aliases: ["天", "日"], dimension: "time", canonical: "天", scaleNum: 86_400n },
  { aliases: ["星期", "周"], dimension: "time", canonical: "周", scaleNum: 604_800n },

  // Money (base: fen)
  { aliases: ["分钱"], dimension: "money", canonical: "分钱", scaleNum: 1n },
  { aliases: ["角", "毛"], dimension: "money", canonical: "角", scaleNum: 10n },
  { aliases: ["元", "圆"], dimension: "money", canonical: "元", scaleNum: 100n },

  // Speed (base: m/h)
  { aliases: ["米/秒", "m/s"], dimension: "speed", canonical: "米/秒", scaleNum: 3600n },
  { aliases: ["米/分", "米/分钟", "m/min"], dimension: "speed", canonical: "米/分", scaleNum: 60n },
  { aliases: ["千米/时", "千米/小时", "公里/小时", "km/h"], dimension: "speed", canonical: "千米/时", scaleNum: 1000n },

  // Angle
  { aliases: ["度", "°"], dimension: "angle", canonical: "度", scaleNum: 1n },
];

// Discrete classifier nouns common in Chinese primary-school word problems
const DISCRETE_SYNONYM_GROUPS: string[][] = [
  ["人", "名", "位", "个学生", "名学生", "名同学", "个小朋友"],
  ["只", "头", "匹"],
  ["本", "册"],
  ["支", "枝"],
  ["辆", "台"],
  ["颗", "粒"],
  ["块", "片", "块积木"],
  ["座", "栋", "座小城堡"],
  ["双", "对"],
  ["次", "趟", "回"],
  ["道", "题", "道题"],
  ["排", "行"],
  ["张"], ["页"], ["盘"], ["个"], ["棵"], ["朵"], ["条"], ["根"], ["段"],
  ["间"], ["层"], ["列"], ["组"], ["班"], ["队"], ["盒"], ["袋"], ["箱"],
  ["筐"], ["篮"], ["瓶"], ["杯"], ["碗"], ["套"], ["件"], ["架"], ["艘"],
  ["岁"], ["步"], ["场"], ["局"], ["种"], ["份"], ["棵树"], ["本书"], ["张卡片"],
];

for (const group of DISCRETE_SYNONYM_GROUPS) {
  const canonical = group[0];
  UNIT_SPECS.push({
    aliases: group,
    dimension: `count:${canonical}`,
    canonical,
    scaleNum: 1n,
    discrete: true,
  });
}

const UNIT_ENTRIES: { alias: string; info: UnitInfo }[] = [];
for (const spec of UNIT_SPECS) {
  const info: UnitInfo = {
    dimension: spec.dimension,
    canonical: spec.canonical,
    scaleNum: spec.scaleNum,
    scaleDen: spec.scaleDen ?? 1n,
    discrete: Boolean(spec.discrete),
  };
  for (const alias of spec.aliases) {
    UNIT_ENTRIES.push({ alias: alias.toLowerCase(), info });
  }
}
// Match longest unit suffix first (e.g. "平方厘米" before "厘米" before "米")
UNIT_ENTRIES.sort((a, b) => b.alias.length - a.alias.length);

function lookupUnit(rawUnit: string): UnitInfo | null {
  const cleaned = rawUnit.replace(/^[（(]|[）)]$/g, "").trim().toLowerCase();
  if (!cleaned) return null;
  const hit = UNIT_ENTRIES.find((u) => u.alias === cleaned);
  if (hit) return hit.info;
  // Unknown pure Chinese classifier suffix (1-3 CJK chars): treat as its own discrete unit so mismatched classifiers still fail
  if (/^[\u4e00-\u9fff]{1,3}$/.test(cleaned)) {
    return { dimension: `custom:${cleaned}`, canonical: cleaned, scaleNum: 1n, scaleDen: 1n, discrete: true };
  }
  return null;
}

function toHalfWidth(s: string): string {
  return s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/**
 * Strips LaTeX wrappers ($...$, \text{...}, \frac{a}{b}, \dots) and conversational prefixes
 * so machine-grading works even when an LLM leaks formatting into answer fields.
 */
export function cleanAnswerText(raw: string): string {
  let s = toHalfWidth(String(raw ?? "")).trim();
  if (!s) return "";

  // Convert mixed LaTeX fraction e.g. 3\frac{3}{4} -> 3又3/4 BEFORE standalone \frac
  s = s.replace(/(-?\d+)\s*\\(?:d|t)?frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(\d+)\s*\}/g, "$1又$2/$3");
  s = s.replace(/\\(?:d|t)?frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(\d+)\s*\}/g, "$1/$2");
  s = s.replace(/\\(?:text|mathrm|textbf|mathbf)\s*\{([^}]*)\}/g, "$1");
  s = s.replace(/\\(?:dots|ldots|cdots|dotsb)+/g, "……");
  s = s.replace(/\\div\b/g, "÷").replace(/\\times\b/g, "×").replace(/\\cdot\b/g, "×");
  s = s.replace(/\\\$/g, "").replace(/\$/g, "");
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, "");
  s = s.replace(/[，、]/g, ",").replace(/[；]/g, ";").replace(/[：]/g, ":");
  s = s.replace(/[。！!？?\s]+$/g, "").trim();

  // Strip common conversational prefixes ("答：可以装 5 盘" -> "5 盘")
  s = s.replace(/^(?:答\s*[:：]?|答案(?:是|为)?\s*[:：]?|结果(?:是|为)?\s*[:：]?)\s*/i, "");
  return s.trim();
}

function stripLeadingProse(s: string): string {
  return s
    .replace(/^(?:最多|最少|至少)?(?:可以|能|需要|要|一共|共|还剩|剩下|平均(?:每人|每盘|每组|每盒|每袋)?)*[装买做搭坐分剪截折摆种浇看读折跑走修运载住放拿领发得有是]?[了建出成]?/u, "")
    .trim();
}

/** Parses a bare numeric literal (integer, decimal, a/b, k又a/b, k a/b, n%) into an exact Rational. */
function parseBareRational(numStr: string): Rational | null {
  const s = numStr.trim().replace(/^\+/, "");
  if (!s) return null;

  // Percentage: 75% or 12.5%
  const pct = s.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (pct) {
    const base = parseBareRational(pct[1]);
    return base ? rationalDiv(base, { num: 100n, den: 1n }) : null;
  }

  // Mixed fraction: 3又3/4 or 3 3/4
  const mixed = s.match(/^(-?\d+)(?:又|\s+)(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = BigInt(mixed[1]);
    const num = BigInt(mixed[2]);
    const den = BigInt(mixed[3]);
    if (den === 0n || num < 0n) return null;
    const sign = whole < 0n ? -1n : 1n;
    const absWhole = whole < 0n ? -whole : whole;
    return makeRational(sign * (absWhole * den + num), den);
  }

  // Simple fraction: -3/4
  const frac = s.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    return makeRational(BigInt(frac[1]), BigInt(frac[2]));
  }

  // Integer
  if (/^-?\d+$/.test(s)) {
    return makeRational(BigInt(s), 1n);
  }

  // Finite decimal: -12.345
  const dec = s.match(/^(-?)(\d+)\.(\d+)$/);
  if (dec) {
    const sign = dec[1] === "-" ? -1n : 1n;
    const intPart = BigInt(dec[2]);
    const fracDigits = dec[3];
    const scale = 10n ** BigInt(fracDigits.length);
    const fracPart = BigInt(fracDigits);
    return makeRational(sign * (intPart * scale + fracPart), scale);
  }

  return null;
}

function splitNumberAndUnit(token: string): { numPart: string; rawUnit: string; unit: UnitInfo | null } | null {
  let t = token.trim();
  if (!t) return null;
  t = t.replace(/^[（(](.+)[）)]$/, "$1").trim();

  // Compound same-dimension units like "1小时30分" or "2元5角" or "3米50厘米"
  const compound = t.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z\u4e00-\u9fff°²³]+)(\d+(?:\.\d+)?)([a-zA-Z\u4e00-\u9fff°²³]+)$/);
  if (compound) {
    const u1 = lookupUnit(compound[2]);
    const u2 = lookupUnit(compound[4]);
    if (u1 && u2 && u1.dimension === u2.dimension) {
      const v1 = parseBareRational(compound[1]);
      const v2 = parseBareRational(compound[3]);
      if (v1 && v2) {
        const base1 = rationalMul(v1, { num: u1.scaleNum, den: u1.scaleDen });
        const base2 = rationalMul(v2, { num: u2.scaleNum, den: u2.scaleDen });
        const sumBase = rationalAdd(base1, base2);
        const inU2 = rationalDiv(sumBase, { num: u2.scaleNum, den: u2.scaleDen });
        if (inU2) {
          return { numPart: `${inU2.num}/${inU2.den}`, rawUnit: compound[4], unit: u2 };
        }
      }
    }
  }

  // Match leading numeric pattern (mixed fraction, fraction, percent, decimal, integer) + trailing unit
  const m = t.match(/^(-?\d+\s*又\s*\d+\/\d+|-?\d+\s+\d+\/\d+|-?\d+\/\d+|-?\d+(?:\.\d+)?%?)\s*(.*)$/);
  if (!m) return null;
  const numPart = m[1].replace(/\s*又\s*/, "又");
  const rawUnit = m[2].trim();
  if (!rawUnit) return { numPart, rawUnit: "", unit: null };

  const unwrapped = rawUnit.replace(/^[（(]\s*|\s*[）)]$/g, "").trim();
  const unit = lookupUnit(unwrapped);
  if (!unit) return null;
  return { numPart, rawUnit: unwrapped, unit };
}

function tryParseQuotientRemainder(cleaned: string): ParsedAnswer | null {
  // Forms:
  // "5……3", "5...3", "5…3", "5余3", "商5余3", "5盘……3个", "5(盘)……3(个)",
  // "5盘余3个", "5盘剩3个", "可以装5盘,还剩4个", "最多可以搭建5座小城堡,还剩1块积木"
  const qrMatch = cleaned.match(
    /(?:^|[^\d/-])(?:商\s*)?(\d+)\s*([（(]?[\u4e00-\u9fff]{0,6}[）)]?)?\s*(?:[,;]\s*)?(?:……|\.{2,}|…+|余下|剩余|还剩|余|剩)\s*(\d+)\s*([（(]?[\u4e00-\u9fff]{0,6}[）)]?)?\s*$/u,
  );
  if (!qrMatch) return null;
  const q = BigInt(qrMatch[1]);
  const r = BigInt(qrMatch[3]);
  const qUnit = qrMatch[2] ? lookupUnit(qrMatch[2]) : null;
  const rUnit = qrMatch[4] ? lookupUnit(qrMatch[4]) : null;
  return { kind: "qr", quotient: q, remainder: r, qUnit, rUnit };
}

export function parseMathAnswer(raw: string): ParsedAnswer | null {
  const cleaned = cleanAnswerText(raw);
  if (!cleaned) return null;
  // Division by zero is never a valid answer (must not fall through to text equality)
  if (/\d\s*\/\s*0+(?![0-9.])/.test(cleaned)) return null;

  // 1. Quotient + Remainder (must run before comma tuple split because "可以装5盘,还剩4个" has a comma!)
  const qr = tryParseQuotientRemainder(cleaned);
  if (qr) return qr;

  // 2. Ratio: "3:4" or "3比4" or "1:2:3"
  const ratioNorm = cleaned.replace(/\s*比\s*/g, ":");
  if (/^-?\d+(?:\.\d+)?(?:\s*:\s*-?\d+(?:\.\d+)?)+$/.test(ratioNorm)) {
    const parts = ratioNorm.split(":").map((p) => parseBareRational(p.trim()));
    if (parts.every((p): p is Rational => p !== null)) {
      return { kind: "ratio", parts };
    }
  }

  // 3. Direct scalar (number + optional unit), or after stripping conversational prefix ("可以装 23 颗")
  for (const candidate of [cleaned, stripLeadingProse(cleaned)]) {
    if (!candidate) continue;
    const split = splitNumberAndUnit(candidate);
    if (split) {
      const value = parseBareRational(split.numPart);
      if (value) return { kind: "rational", value, unit: split.unit, rawUnit: split.rawUnit };
    }
  }

  // 4. Multi-part tuple separated by "," or ";" (e.g. "5盘, 3个" or "5, 3" or "长8厘米, 宽4厘米")
  if (cleaned.includes(",") || cleaned.includes(";")) {
    const rawParts = cleaned.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (rawParts.length >= 2) {
      const parsedItems = rawParts.map((part) => {
        const stripped = part.replace(/^[\u4e00-\u9fff]{1,4}[:：=]?/u, (prefix) => {
          // Strip labels like "长8厘米" -> "8厘米" when followed by a digit
          return /\d/.test(part.slice(prefix.length)) ? "" : prefix;
        });
        return parseMathAnswer(stripped) ?? parseMathAnswer(part);
      });
      if (parsedItems.every((x): x is ParsedAnswer => x !== null && x.kind === "rational")) {
        return { kind: "tuple", items: parsedItems };
      }
    }
  }

  // 5. Fallback normalized text (e.g. "够", "不够", "能", "不能", ">", "<", "=")
  return { kind: "text", normalized: cleaned.replace(/\s+/g, "").toLowerCase() };
}

function unitsCompatibleAndEqual(
  uVal: Rational,
  uUnit: UnitInfo | null,
  eVal: Rational,
  eUnit: UnitInfo | null,
): boolean {
  // Bare number on EITHER side is accepted if numeric values match ("30" === "30张", "12 个" === "12")
  if (!uUnit || !eUnit) {
    return rationalEquals(uVal, eVal);
  }
  // Both sides explicitly specified units -> dimensions MUST match and scaled values MUST match ("6厘米" !== "6米", "600厘米" === "6米")
  if (uUnit.dimension !== eUnit.dimension) return false;
  const uScaled = rationalMul(uVal, { num: uUnit.scaleNum, den: uUnit.scaleDen });
  const eScaled = rationalMul(eVal, { num: eUnit.scaleNum, den: eUnit.scaleDen });
  return rationalEquals(uScaled, eScaled);
}

export function isAnswerCorrect(userRaw: string, expectedRaw: string): boolean {
  const u = parseMathAnswer(userRaw);
  const e = parseMathAnswer(expectedRaw);
  if (!u || !e) return false;

  if (u.kind === "rational" && e.kind === "rational") {
    return unitsCompatibleAndEqual(u.value, u.unit, e.value, e.unit);
  }

  if (u.kind === "qr" && e.kind === "qr") {
    if (u.quotient !== e.quotient || u.remainder !== e.remainder) return false;
    if (u.qUnit && e.qUnit && u.qUnit.dimension !== e.qUnit.dimension) return false;
    if (u.rUnit && e.rUnit && u.rUnit.dimension !== e.rUnit.dimension) return false;
    return true;
  }

  // Allow 2-element integer tuple ("5, 4" or "5盘, 4个") to match QuotientRemainder ("5盘……4个") and vice versa
  if (u.kind === "tuple" && e.kind === "qr" && u.items.length === 2) {
    const [a, b] = u.items;
    if (a.kind === "rational" && b.kind === "rational" && a.value.den === 1n && b.value.den === 1n) {
      if (a.value.num !== e.quotient || b.value.num !== e.remainder) return false;
      if (a.unit && e.qUnit && a.unit.dimension !== e.qUnit.dimension) return false;
      if (b.unit && e.rUnit && b.unit.dimension !== e.rUnit.dimension) return false;
      return true;
    }
  }
  if (u.kind === "qr" && e.kind === "tuple" && e.items.length === 2) {
    const [a, b] = e.items;
    if (a.kind === "rational" && b.kind === "rational" && a.value.den === 1n && b.value.den === 1n) {
      return u.quotient === a.value.num && u.remainder === b.value.num;
    }
  }

  if (u.kind === "ratio" && e.kind === "ratio") {
    return u.parts.length === e.parts.length && u.parts.every((p, i) => rationalEquals(p, e.parts[i]));
  }

  if (u.kind === "tuple" && e.kind === "tuple") {
    if (u.items.length !== e.items.length) return false;
    return u.items.every((item, idx) => {
      const exp = e.items[idx];
      if (item.kind === "rational" && exp.kind === "rational") {
        return unitsCompatibleAndEqual(item.value, item.unit, exp.value, exp.unit);
      }
      return false;
    });
  }

  if (u.kind === "text" && e.kind === "text") {
    return u.normalized.length > 0 && u.normalized === e.normalized;
  }

  return false;
}

/**
 * Safe zero-dependency recursive-descent evaluator for primary-school arithmetic expressions:
 * supports +, -, *, /, ×, ÷, parentheses, integers, and decimals using exact BigInt Rationals.
 */
export function evaluateArithmeticExpr(expr: string): Rational | null {
  const normalized = toHalfWidth(String(expr ?? ""))
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
  if (!normalized || !/^[0-9.+\-*/()]+$/.test(normalized)) return null;

  let pos = 0;

  function parseExpression(): Rational | null {
    let left = parseTerm();
    if (!left) return null;
    while (pos < normalized.length && (normalized[pos] === "+" || normalized[pos] === "-")) {
      const op = normalized[pos++];
      const right = parseTerm();
      if (!right) return null;
      left = op === "+" ? rationalAdd(left, right) : rationalSub(left, right);
    }
    return left;
  }

  function parseTerm(): Rational | null {
    const first = parseFactor();
    if (!first) return null;
    let acc: Rational = first;
    while (pos < normalized.length && (normalized[pos] === "*" || normalized[pos] === "/")) {
      const op = normalized[pos++];
      const right = parseFactor();
      if (!right) return null;
      const next: Rational | null = op === "*" ? rationalMul(acc, right) : rationalDiv(acc, right);
      if (!next) return null;
      acc = next;
    }
    return acc;
  }

  function parseFactor(): Rational | null {
    if (normalized[pos] === "+") {
      pos++;
      return parseFactor();
    }
    if (normalized[pos] === "-") {
      pos++;
      const inner = parseFactor();
      return inner ? { num: -inner.num, den: inner.den } : null;
    }
    if (normalized[pos] === "(") {
      pos++;
      const inner = parseExpression();
      if (!inner || normalized[pos] !== ")") return null;
      pos++;
      return inner;
    }
    const start = pos;
    while (pos < normalized.length && /[0-9.]/.test(normalized[pos])) pos++;
    const numTok = normalized.slice(start, pos);
    if (!numTok) return null;
    return parseBareRational(numTok);
  }

  const result = parseExpression();
  if (!result || pos !== normalized.length) return null;
  return result;
}

/** Canonicalizes an LLM answer field (stripping LaTeX/prose while keeping value + unit). */
export function canonicalizeAnswerField(raw: string): string {
  const cleaned = cleanAnswerText(raw);
  if (!cleaned) return raw.trim();
  const parsed = parseMathAnswer(cleaned);
  if (!parsed) return cleaned;
  if (parsed.kind === "qr") {
    const qu = parsed.qUnit?.canonical ?? "";
    const ru = parsed.rUnit?.canonical ?? "";
    return `${parsed.quotient}${qu}……${parsed.remainder}${ru}`;
  }
  if (parsed.kind === "rational") {
    const preferDecimal = /\d+\.\d+/.test(cleaned) && !cleaned.includes("/");
    const isPct = cleaned.includes("%");
    if (isPct) {
      const pctVal = rationalMul(parsed.value, { num: 100n, den: 1n });
      return `${formatRational(pctVal, true)}%`;
    }
    return `${formatRational(parsed.value, preferDecimal)}${parsed.rawUnit}`;
  }
  if (parsed.kind === "ratio") {
    return parsed.parts.map((p) => formatRational(p)).join(":");
  }
  return cleaned;
}

/**
 * S12 zero-latency deterministic verifier:
 * 1. Cleans LaTeX/prose from correct_answer and variant answers.
 * 2. When answer_expr / correct_expr evaluates cleanly on a scalar problem and disagrees
 *    with the LLM's stated scalar answer, auto-heals the answer in-process (preserving unit).
 * 3. Flags negative quantities or fractional discrete counts (e.g. "3.5人").
 */
export function verifyDiagnosisMath<T extends DiagnosisMathInput>(input: T): {
  diagnosis: T;
  warnings: MathVerificationWarning[];
} {
  const warnings: MathVerificationWarning[] = [];

  function checkAndHeal(target: string, answer: string, expr?: string): string {
    const canonical = canonicalizeAnswerField(answer);
    const parsed = parseMathAnswer(canonical);

    if (parsed?.kind === "rational") {
      if (parsed.value.num < 0n) {
        warnings.push({ target, reason: "negative_primary_school_answer" });
      }
      if (parsed.unit?.discrete && parsed.value.den !== 1n) {
        warnings.push({ target, reason: "discrete_unit_non_integer" });
      }
      if (expr) {
        const evaluated = evaluateArithmeticExpr(expr);
        if (evaluated && evaluated.num >= 0n) {
          if (parsed.unit?.discrete && evaluated.den !== 1n) {
            warnings.push({ target, reason: "expr_discrete_unit_non_integer" });
          } else if (!rationalEquals(evaluated, parsed.value)) {
            const preferDecimal = /\d+\.\d+/.test(canonical) && !canonical.includes("/");
            const healed = `${formatRational(evaluated, preferDecimal)}${parsed.rawUnit}`;
            warnings.push({
              target,
              reason: "expr_mismatch_auto_healed",
              repairedFrom: canonical,
              repairedTo: healed,
            });
            return healed;
          }
        }
      }
    }
    return canonical;
  }

  const healedCorrect = checkAndHeal("correct_answer", input.correct_answer, input.correct_expr);
  const healedVariants = (input.variants ?? []).map((v) => ({
    ...v,
    answer: checkAndHeal(v.level, v.answer, v.answer_expr),
  }));

  return {
    diagnosis: {
      ...input,
      correct_answer: healedCorrect,
      variants: healedVariants,
    },
    warnings,
  };
}
