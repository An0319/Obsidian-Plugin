import {
  IOrganizeEngine,
  Suggestion,
  EngineLevel,
  OllamaSettings,
  OllamaPromptContext,
  OllamaError,
} from "../types";
import { normalizeFolderPath } from "../utils/helpers";

/** HTTP 客户端抽象：便于测试 mock 与 Obsidian requestUrl 适配 */
export interface HttpClient {
  postJson(url: string, body: unknown, timeoutMs: number): Promise<string>;
}

export class OllamaEngine implements IOrganizeEngine {
  readonly name = "本地大模型（Ollama）";
  readonly level = EngineLevel.Ollama;

  constructor(
    private settings: OllamaSettings,
    private http: HttpClient,
    private getContext: () => OllamaPromptContext | null = () => null
  ) {}

  setSettings(settings: OllamaSettings): void {
    this.settings = settings;
  }

  /** 检测 Ollama 是否可运行 */
  async isAvailable(): Promise<boolean> {
    try {
      await this.http.postJson(
        `${this.settings.address}/api/generate`,
        { model: this.settings.model, prompt: "ping", stream: false },
        Math.min(this.settings.timeoutMs, 5000)
      );
      return true;
    } catch {
      return false;
    }
  }

  static buildPrompt(ctx: OllamaPromptContext): string {
    const truncated =
      ctx.content.length > 4000
        ? `${ctx.content.slice(0, 4000)}…（内容已截断）`
        : ctx.content;
    return [
      "你是一个知识管理助手。以下是一篇笔记的标题和内容，以及当前知识库的文件夹结构（JSON 数组）。",
      "请分析笔记主题，返回最适合存放它的文件夹路径（相对于根目录的路径）。",
      '如果认为需要新建文件夹，请在路径中体现（如 "新文件夹/子文件夹"）。',
      '只返回 JSON 格式：{"suggested_path": "路径", "confidence": 0.8}',
      `笔记标题：${ctx.title}`,
      `笔记内容：${truncated}`,
      `现有文件夹结构：${JSON.stringify(ctx.folderTree)}`,
    ].join("\n");
  }

  /** 容错解析模型输出：剥离 markdown 代码块、提取首个 JSON 对象 */
  static parseModelOutput(text: string): {
    suggested_path: string;
    confidence: number;
  } {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new OllamaError("模型未返回 JSON", "bad_response");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new OllamaError("模型返回的 JSON 无法解析", "bad_response");
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.suggested_path !== "string") {
      throw new OllamaError("模型返回缺少 suggested_path", "bad_response");
    }
    const confidence =
      typeof obj.confidence === "number"
        ? Math.min(1, Math.max(0, obj.confidence))
        : 0.5;
    return { suggested_path: obj.suggested_path, confidence };
  }

  async analyze(
    title: string,
    content: string,
    _filePath: string
  ): Promise<Suggestion> {
    // getContext 仅提供文件夹结构等辅助信息，标题与正文始终以实际笔记为准
    const extra = this.getContext();
    const ctx: OllamaPromptContext = {
      title,
      content,
      folderTree: extra?.folderTree ?? [],
    };
    const prompt = OllamaEngine.buildPrompt(ctx);

    let response: string;
    try {
      response = await this.http.postJson(
        `${this.settings.address}/api/generate`,
        {
          model: this.settings.model,
          prompt,
          stream: false,
          options: { temperature: 0.1 },
        },
        this.settings.timeoutMs
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new OllamaError(`Ollama 请求失败：${message}`, "unavailable");
    }

    // Ollama /api/generate 返回 { response: "模型文本" }，兼容直接返回文本的情况
    let modelText = response;
    try {
      const apiResp = JSON.parse(response) as Record<string, unknown>;
      if (typeof apiResp.response === "string") {
        modelText = apiResp.response;
      }
    } catch {
      // 非标准 JSON：按原始文本处理
    }

    const { suggested_path, confidence } =
      OllamaEngine.parseModelOutput(modelText);
    return {
      suggestedPath: normalizeFolderPath(suggested_path),
      confidence,
      reason: `模型 ${this.settings.model} 的语义分析建议`,
      engine: this.level,
    };
  }
}
