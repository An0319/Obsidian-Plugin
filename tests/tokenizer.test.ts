import { describe, it, expect } from "vitest";
import { tokenize, termFrequency, stripMarkdownNoise } from "../src/engines/tfidf/tokenizer";

describe("tokenize", () => {
  it("英文按单词切分并小写化", () => {
    expect(tokenize("Hello World TypeScript")).toEqual([
      "hello",
      "world",
      "typescript",
    ]);
  });

  it("中文按二元组切分", () => {
    const tokens = tokenize("投资笔记");
    expect(tokens).toContain("投资");
    expect(tokens).toContain("资笔");
    expect(tokens).toContain("笔记");
    expect(tokens).toHaveLength(3);
  });

  it("单字中文保留为一元组", () => {
    expect(tokenize("好")).toEqual(["好"]);
  });

  it("中英混合文本", () => {
    const tokens = tokenize("用 React 写前端组件");
    expect(tokens).toContain("react");
    expect(tokens).toContain("前端");
    expect(tokens).toContain("端组");
    expect(tokens).toContain("组件");
  });

  it("去除 markdown 代码块与链接噪声", () => {
    const text = "标题\n```js\nconst x = 1;\n```\n[链接文字](https://a.com)\n更多内容";
    const tokens = tokenize(text);
    expect(tokens).not.toContain("const");
    expect(tokens).toContain("链接");
    expect(tokens).toContain("文字");
    expect(tokens).toContain("更多");
  });

  it("wiki 链接保留目标名", () => {
    const tokens = tokenize("[[投资笔记/竞品分析]]");
    expect(tokens.some((t) => t.includes("竞品"))).toBe(true);
  });
});

describe("stripMarkdownNoise", () => {
  it("移除图片和 URL", () => {
    const out = stripMarkdownNoise("![alt](img.png) 访问 https://example.com 正文");
    expect(out).toContain("正文");
    expect(out).not.toContain("img.png");
    expect(out).not.toContain("example.com");
  });
});

describe("termFrequency", () => {
  it("统计词频", () => {
    expect(termFrequency(["a", "b", "a"])).toEqual({ a: 2, b: 1 });
  });

  it("空输入返回空对象", () => {
    expect(termFrequency([])).toEqual({});
  });
});
