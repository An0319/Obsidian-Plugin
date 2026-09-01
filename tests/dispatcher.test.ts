import { describe, it, expect } from "vitest";
import { EngineDispatcher } from "../src/scheduler/dispatcher";
import { IOrganizeEngine, EngineLevel, Suggestion, OllamaError } from "../src/types";
import { OllamaEngine, HttpClient } from "../src/engines/ollamaEngine";

function stubEngine(
  level: EngineLevel,
  impl: () => Promise<Suggestion>
): IOrganizeEngine {
  return {
    name: `engine-${level}`,
    level,
    analyze: impl,
  };
}

describe("EngineDispatcher 降级逻辑", () => {
  it("首选引擎正常时直接返回", async () => {
    const dispatcher = new EngineDispatcher();
    dispatcher.register(
      stubEngine(EngineLevel.Rules, () =>
        Promise.resolve({
          suggestedPath: "规则目标",
          confidence: 1,
          reason: "",
          engine: EngineLevel.Rules,
        })
      )
    );
    const { suggestion, degradedFrom } = await dispatcher.analyzeWithFallback(
      "t",
      "c",
      "p",
      EngineLevel.Rules
    );
    expect(suggestion?.suggestedPath).toBe("规则目标");
    expect(degradedFrom).toBeUndefined();
  });

  it("层级三失败自动降级到层级二", async () => {
    const dispatcher = new EngineDispatcher();
    dispatcher.register(
      stubEngine(EngineLevel.Ollama, () =>
        Promise.reject(new OllamaError("连接失败", "unavailable"))
      )
    );
    dispatcher.register(
      stubEngine(EngineLevel.Tfidf, () =>
        Promise.resolve({
          suggestedPath: "tfidf目标",
          confidence: 0.5,
          reason: "",
          engine: EngineLevel.Tfidf,
        })
      )
    );
    const { suggestion, degradedFrom, error } = await dispatcher.analyzeWithFallback(
      "t",
      "c",
      "p",
      EngineLevel.Ollama
    );
    expect(suggestion?.suggestedPath).toBe("tfidf目标");
    expect(degradedFrom).toBe(EngineLevel.Ollama);
    expect(error).toBeUndefined();
  });

  it("所有引擎失败返回 null 与错误信息", async () => {
    const dispatcher = new EngineDispatcher();
    dispatcher.register(
      stubEngine(EngineLevel.Ollama, () =>
        Promise.reject(new OllamaError("不可用", "unavailable"))
      )
    );
    dispatcher.register(
      stubEngine(EngineLevel.Tfidf, () =>
        Promise.reject(new Error("计算错误"))
      )
    );
    const { suggestion, error } = await dispatcher.analyzeWithFallback(
      "t",
      "c",
      "p",
      EngineLevel.Ollama
    );
    expect(suggestion).toBeNull();
    expect(error).toContain("计算错误");
  });
});

describe("OllamaEngine 输出解析", () => {
  const httpOk: HttpClient = {
    async postJson() {
      return JSON.stringify({ response: '{"suggested_path": "技术/前端", "confidence": 0.85}' });
    },
  };

  it("解析裸 JSON 响应", async () => {
    const engine = new OllamaEngine(
      { address: "http://localhost:11434", model: "qwen2.5:7b", timeoutMs: 5000, fallback: true },
      httpOk
    );
    const result = await engine.analyze("t", "c", "p");
    expect(result.suggestedPath).toBe("技术/前端");
    expect(result.confidence).toBe(0.85);
  });

  it("解析 markdown 代码块包裹的 JSON", () => {
    const parsed = OllamaEngine.parseModelOutput(
      '好的，以下是建议：\n```json\n{"suggested_path": "日记", "confidence": 0.9}\n```\n以上。'
    );
    expect(parsed.suggested_path).toBe("日记");
  });

  it("非 JSON 响应抛出 bad_response", () => {
    expect(() => OllamaEngine.parseModelOutput("抱歉我不知道")).toThrow(OllamaError);
  });

  it("confidence 越界被钳制", () => {
    const parsed = OllamaEngine.parseModelOutput('{"suggested_path":"a","confidence":5}');
    expect(parsed.confidence).toBe(1);
  });

  it("请求失败抛出 OllamaError(unavailable)", async () => {
    const httpFail: HttpClient = {
      async postJson() {
        throw new Error("ECONNREFUSED");
      },
    };
    const engine = new OllamaEngine(
      { address: "http://localhost:11434", model: "m", timeoutMs: 1000, fallback: true },
      httpFail
    );
    await expect(engine.analyze("t", "c", "p")).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("Prompt 包含标题、内容与文件夹结构", () => {
    const prompt = OllamaEngine.buildPrompt({
      title: "标题A",
      content: "正文B",
      folderTree: ["a", "b"],
    });
    expect(prompt).toContain("标题A");
    expect(prompt).toContain("正文B");
    expect(prompt).toContain('["a","b"]');
    expect(prompt).toContain("suggested_path");
  });

  it("超长内容被截断", () => {
    const prompt = OllamaEngine.buildPrompt({
      title: "t",
      content: "x".repeat(6000),
      folderTree: [],
    });
    expect(prompt).toContain("内容已截断");
  });
});
