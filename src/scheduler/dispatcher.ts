import {
  IOrganizeEngine,
  EngineLevel,
  Suggestion,
  OllamaError,
} from "../types";
/** 引擎注册表：level -> 引擎实例 */
export class EngineDispatcher {
  private engines = new Map<EngineLevel, IOrganizeEngine>();

  register(engine: IOrganizeEngine): void {
    this.engines.set(engine.level, engine);
  }

  get(level: EngineLevel): IOrganizeEngine | undefined {
    return this.engines.get(level);
  }

  /** 按降级顺序返回候选引擎序列（从指定层级向下） */
  private fallbackChain(level: EngineLevel): EngineLevel[] {
    switch (level) {
      case EngineLevel.Ollama:
        return [EngineLevel.Ollama, EngineLevel.Tfidf, EngineLevel.Rules];
      case EngineLevel.Tfidf:
        return [EngineLevel.Tfidf, EngineLevel.Rules];
      case EngineLevel.SharedModel:
        return [EngineLevel.SharedModel, EngineLevel.Rules];
      default:
        return [EngineLevel.Rules];
    }
  }

  /**
   * 使用指定层级引擎分析；失败时按层级自动降级。
   * 返回 null 表示所有引擎都无法给出建议。
   */
  async analyzeWithFallback(
    title: string,
    content: string,
    filePath: string,
    level: EngineLevel,
    mtime?: number
  ): Promise<{ suggestion: Suggestion | null; degradedFrom?: EngineLevel; error?: string }> {
    let lastError = "";
    for (const lvl of this.fallbackChain(level)) {
      const engine = this.engines.get(lvl);
      if (!engine) continue;
      try {
        const suggestion = await engine.analyze(title, content, filePath, mtime);
        return {
          suggestion,
          degradedFrom:
            lvl !== level && suggestion.confidence > 0 ? level : undefined,
          error: undefined,
        };
      } catch (err) {
        // 层级三不可用时降级；其他引擎异常也记录并继续降级
        lastError =
          err instanceof OllamaError
            ? `${engine.name}：${err.message}`
            : `${engine.name}：${err instanceof Error ? err.message : String(err)}`;
        if (err instanceof OllamaError && err.kind === "bad_response") {
          // 模型返回异常内容属于引擎问题，同样降级
          continue;
        }
      }
    }
    return { suggestion: null, error: lastError };
  }
}
