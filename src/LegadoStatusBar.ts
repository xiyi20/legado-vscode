import * as vscode from "vscode";
import { get } from "http";
import { get as getHttps } from "https";
import { WebAppPanel } from "./WebAppPanel";

/** 阅读进度数据：由 webview 面板同步过来 */
export interface BookProgress {
  bookUrl: string;
  bookName: string;
  bookAuthor: string;
  chapterIndex: number;
  chapterPos: number;
  chapterTitle?: string;
}

interface ChapterListItem {
  index: number;
  title: string;
}

interface LegadoApiResponse<T> {
  isSuccess: boolean;
  errorMsg?: string;
  data?: T;
}

/** 状态栏中一行正文（由段落按标点/字数切分而来） */
interface LineEntry {
  /** 纯文本行内容 */
  text: string;
  /** 该行所属的段落索引（用于悬停时定位完整段落） */
  paragraphIndex: number;
}

/**
 * VSCode 状态栏摸鱼阅读器：
 * - 小说正文直接以一行文字显示在状态栏中，状态栏文字可实时刷新，无弹窗
 * - 鼠标点击状态栏或按快捷键即可翻行/翻章
 * - 鼠标悬停状态栏可查看当前完整段落（tooltip 悬停期间不实时刷新，移出再进入即可）
 * - 进度由 webview 面板通过 postMessage("readingProgress") 同步
 */
export class LegadoStatusBar {
  public static current: LegadoStatusBar | undefined;

  private readonly statusItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  private webServeUrl: string = "";
  private enabled: boolean = true;
  private lineLength: number = 30;

  /** webview 面板同步过来的进度 */
  private panelProgress: BookProgress | null = null;
  /** 状态栏当前展示的进度（状态栏翻页时改动此字段，不影响面板） */
  private displayProgress: BookProgress | null = null;

  /** 章节目录，供上下章切换使用 */
  private catalog: ChapterListItem[] = [];
  private catalogLoaded: boolean = false;

  /** 当前章节原始段落（用于 tooltip 展示完整段落） */
  private paragraphs: string[] = [];
  /** 当前章节切好的行 */
  private chapterLines: LineEntry[] = [];
  /** 当前行索引（全局，跨段落） */
  private lineIndex: number = 0;

  /** 正在请求章节内容 */
  private fetching: boolean = false;

  /** 状态栏主动同步进度给面板后，面板会回流一次进度，该标志用于跳过回流避免覆盖状态栏位置 */
  private expectPanelEcho: boolean = false;

  constructor() {
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusItem.name = "阅读APP 状态栏";
    // 初始无进度时点击会打开阅读APP书架；有进度后改为下一行（在 updateStatusBar 中动态切换）
    this.statusItem.command = "legado-vscode.openLegado";

    this.disposables.push(this.statusItem);

    this.refreshConfig();
    this.updateStatusBar();

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("legado-vscode.webServeUrl")) {
          this.refreshConfig();
          // 服务地址变化后重新拉取一次当前章节内容
          this.catalogLoaded = false;
          this.catalog = [];
          this.fetchChapterContent();
        }
        if (e.affectsConfiguration("legado-vscode.statusBarReading")) {
          this.refreshConfig();
          this.updateStatusBar();
        }
        if (e.affectsConfiguration("legado-vscode.statusBarLineLength")) {
          const oldLength = this.lineLength;
          this.refreshConfig();
          if (this.lineLength !== oldLength) {
            // 用已缓存的段落重新切行，尽量保持在当前段落
            const paraIdx = this.currentParagraphIndex;
            this.rebuildLines();
            this.lineIndex = this.firstLineOfParagraph(paraIdx);
            this.updateStatusBar();
          }
        }
      })
    );
  }

  private refreshConfig() {
    let url: string =
      vscode.workspace.getConfiguration().get("legado-vscode.webServeUrl") || "";
    url = url.replace(/^\s+|[\/\s]+$/, "");
    this.webServeUrl = url;
    this.enabled =
      vscode.workspace.getConfiguration().get("legado-vscode.statusBarReading") ??
      true;
    const configuredLength = vscode.workspace
      .getConfiguration()
      .get<number>("legado-vscode.statusBarLineLength");
    this.lineLength =
      typeof configuredLength === "number" && configuredLength >= 10
        ? Math.min(Math.floor(configuredLength), 100)
        : 30;
  }

  /** 由 WebAppPanel 在收到 webview 进度同步消息时调用 */
  public updateFromPanelProgress(progress: BookProgress) {
    if (!this.enabled) return;
    this.panelProgress = progress;

    // 状态栏与面板当前进度完全一致（含 chapterPos）：跳过，避免状态栏翻章/翻行后面板回流导致行索引被重置
    if (
      this.displayProgress &&
      this.displayProgress.bookUrl === progress.bookUrl &&
      this.displayProgress.chapterIndex === progress.chapterIndex &&
      this.displayProgress.chapterPos === progress.chapterPos
    ) {
      return;
    }

    // 状态栏主动同步后面板的第一次回流（同章节）：跳过，避免面板渲染偏移与状态栏纯文本偏移不一致导致 lineIndex 被覆盖
    if (
      this.expectPanelEcho &&
      this.displayProgress &&
      this.displayProgress.bookUrl === progress.bookUrl &&
      this.displayProgress.chapterIndex === progress.chapterIndex
    ) {
      this.expectPanelEcho = false;
      return;
    }

    // 同步进度变化时，把展示进度也归位到面板进度
    const sameChapter =
      this.displayProgress &&
      this.displayProgress.bookUrl === progress.bookUrl &&
      this.displayProgress.chapterIndex === progress.chapterIndex;

    this.displayProgress = { ...progress };
    if (!sameChapter) {
      this.fetchChapterContent();
    } else {
      // 同章节内滚动：精确定位到行。若面板 chapterPos 对应的行与当前一致则跳过，避免循环
      const newLineIndex = this.chapterPosToLineIndex(progress.chapterPos);
      if (newLineIndex !== this.lineIndex) {
        this.lineIndex = newLineIndex;
        this.updateStatusBar();
      }
    }
  }

  /** chapterPos（字符偏移）对应的行索引 */
  private chapterPosToLineIndex(pos: number): number {
    if (!pos || pos <= 0 || this.chapterLines.length === 0) return 0;
    let acc = 0;
    for (let i = 0; i < this.chapterLines.length; i++) {
      acc += this.chapterLines[i].text.length + 1;
      if (acc >= pos) return i;
    }
    return this.chapterLines.length - 1;
  }

  /** 当前行所属段落索引 */
  private get currentParagraphIndex(): number {
    return this.chapterLines[this.lineIndex]?.paragraphIndex ?? 0;
  }

  /** 某段第一行的全局行索引 */
  private firstLineOfParagraph(paragraphIndex: number): number {
    const idx = this.chapterLines.findIndex((l) => l.paragraphIndex === paragraphIndex);
    return idx === -1 ? 0 : idx;
  }

  /** 根据 chapterPos 粗略估算段落索引（按字符数累加） */
  private paragraphIndexFromPos(pos: number): number {
    if (!pos || pos <= 0 || this.paragraphs.length === 0) return 0;
    let acc = 0;
    for (let i = 0; i < this.paragraphs.length; i++) {
      acc += this.paragraphs[i].length + 1;
      if (acc >= pos) return i;
    }
    return this.paragraphs.length - 1;
  }

  /** 用 node 内置 http/https 模块发送 GET 请求 */
  private httpGet<T>(relativePath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.webServeUrl) {
        reject(new Error("未配置阅读APP的WEB服务地址"));
        return;
      }
      const fullUrl = this.webServeUrl + relativePath;
      let parsed: URL;
      try {
        parsed = new URL(fullUrl);
      } catch (e) {
        reject(e);
        return;
      }
      const client = parsed.protocol === "https:" ? getHttps : get;
      const req = client(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers: {
            "User-Agent": "legado-vscode-statusbar",
            Accept: "application/json, text/plain, */*"
          },
          timeout: 30000
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data) as T);
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error("请求超时"));
      });
      req.end();
    });
  }

  /**
   * 拉取章节正文并切行
   * @param goto "first" 定位到本章首行（下一章/面板同步）；"last" 定位到末行（上一章）
   */
  private async fetchChapterContent(goto: "first" | "last" = "first") {
    if (this.fetching) return;
    if (!this.displayProgress || !this.webServeUrl) {
      this.updateStatusBar();
      return;
    }
    this.fetching = true;
    try {
      const { bookUrl, chapterIndex, chapterPos } = this.displayProgress;
      const path =
        "/getBookContent?url=" +
        encodeURIComponent(bookUrl) +
        "&index=" +
        chapterIndex;
      const res = await this.httpGet<LegadoApiResponse<string>>(path);
      if (res.isSuccess && typeof res.data === "string") {
        this.paragraphs = res.data.split(/\n+/).filter((s) => s.trim().length > 0);
        if (this.paragraphs.length === 0) {
          this.paragraphs = ["(本章无内容)"];
        }
      } else {
        this.paragraphs = [`获取章节内容失败：${res.errorMsg || "未知错误"}`];
      }
      this.rebuildLines();

      // 定位起始行
      if (goto === "last") {
        this.lineIndex = this.chapterLines.length - 1;
      } else if (
        this.panelProgress &&
        this.panelProgress.bookUrl === this.displayProgress.bookUrl &&
        this.panelProgress.chapterIndex === chapterIndex
      ) {
        // 面板同步触发的章节加载：按面板 chapterPos 定位
        this.lineIndex = this.firstLineOfParagraph(
          this.paragraphIndexFromPos(chapterPos)
        );
      } else {
        this.lineIndex = 0;
      }

      // 第一次拿到章节内容时顺便补一下目录（不阻塞 UI）
      if (!this.catalogLoaded) {
        this.fetchCatalog().catch(() => undefined);
      }
    } catch (e: any) {
      this.paragraphs = [`获取章节内容失败：${e?.message || String(e)}`];
      this.rebuildLines();
      this.lineIndex = 0;
    } finally {
      this.fetching = false;
      this.updateStatusBar();
    }
  }

  /** 用当前 paragraphs 重新切分章节行 */
  private rebuildLines() {
    const lines: LineEntry[] = [];
    this.paragraphs.forEach((para, paragraphIndex) => {
      const plainLines = this.splitParagraphToLines(para);
      plainLines.forEach((text) => {
        lines.push({ text, paragraphIndex });
      });
    });
    this.chapterLines = lines.length > 0 ? lines : [{ text: "(无内容)", paragraphIndex: 0 }];
  }

  private async fetchCatalog() {
    if (!this.displayProgress || !this.webServeUrl) return;
    try {
      const path = "/getChapterList?url=" + encodeURIComponent(this.displayProgress.bookUrl);
      const res = await this.httpGet<LegadoApiResponse<ChapterListItem[]>>(path);
      if (res.isSuccess && Array.isArray(res.data)) {
        this.catalog = res.data.map((item: any, idx: number) => ({
          index: typeof item.index === "number" ? item.index : idx,
          title: item.title || `第${idx + 1}章`
        }));
        this.catalogLoaded = true;
      }
    } catch {
      // 目录拉取失败不影响主要阅读体验
    }
  }

  /** 去除正文中的 HTML 标签（状态栏只能显示纯文本） */
  private stripHtml(text: string): string {
    return text
      .replace(/<img[^>]*>/gi, "[图片]")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /** 把一个段落按标点/长度切成适合状态栏单行显示的若干行 */
  private splitParagraphToLines(paragraph: string): string[] {
    const plain = this.stripHtml(paragraph);
    if (!plain) return [];
    const maxLen = this.lineLength;
    const lines: string[] = [];
    // 先按句末标点切分（保留分隔符），再按逗号细分，最后硬切
    const sentences = plain.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) || [plain];
    for (const sentence of sentences) {
      const pieces = sentence.match(/[^，,、]+[，,、]*/g) || [sentence];
      for (const piece of pieces) {
        let rest = piece;
        while (rest.length > maxLen) {
          lines.push(rest.slice(0, maxLen));
          rest = rest.slice(maxLen);
        }
        if (rest.length > 0) {
          const last = lines[lines.length - 1];
          if (last && last.length + rest.length <= maxLen) {
            lines[lines.length - 1] = last + rest;
          } else {
            lines.push(rest);
          }
        }
      }
    }
    return lines.filter((l) => l.trim().length > 0);
  }

  /**
   * 构建悬停 tooltip：只显示翻页操作按钮，不显示任何正文
   */
  private buildTooltipMarkdown(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.supportHtml = true;

    // 第一行：章节名 + 跳转按钮
    const chapterTitle = this.displayProgress?.chapterTitle || `第${(this.displayProgress?.chapterIndex ?? 0) + 1}章`;
    const progressLabel = `${this.lineIndex + 1}/${this.chapterLines.length}`;
    const gotoArgs = encodeURIComponent(JSON.stringify(["tooltip"]));
    md.appendMarkdown(`**${this.escapeMd(chapterTitle)}**  `);
    md.appendMarkdown(`[$(list-ordered) ${progressLabel}](command:legado-vscode.statusBarGotoLine?${gotoArgs} "点击输入行数跳转")\n\n`);

    // 第二行：上一行 / 下一行
    md.appendMarkdown(
      `[$(arrow-up) 上一行](command:legado-vscode.statusBarPrevLine "上一行")  `
    );
    md.appendMarkdown(
      `[$(arrow-down) 下一行](command:legado-vscode.statusBarNextLine "下一行")`
    );
    return md;
  }

  private escapeMd(text: string): string {
    return text.replace(/([\\`*_\[\]()#+\-.!|>~])/g, "\\$1");
  }

  private updateStatusBar() {
    // 未开启功能：完全隐藏
    if (!this.enabled) {
      this.statusItem.hide();
      vscode.commands.executeCommand(
        "setContext",
        "legado-vscode:statusBarReady",
        false
      );
      return;
    }

    // 已开启但尚无阅读进度：显示"等待初始化"，点击打开阅读APP书架
    if (!this.displayProgress) {
      this.statusItem.text = "$(book) 等待初始化";
      this.statusItem.tooltip = "点击打开阅读APP书架并选择一本书";
      this.statusItem.command = "legado-vscode.openLegado";
      this.statusItem.show();
      vscode.commands.executeCommand(
        "setContext",
        "legado-vscode:statusBarReady",
        false
      );
      return;
    }

    const line = this.chapterLines[this.lineIndex]?.text || "";
    // 章节加载期间保持上一行文字，避免状态栏闪烁暴露"正在加载"
    this.statusItem.text = `$(book) ${line}`;
    this.statusItem.tooltip = this.buildTooltipMarkdown();
    // 有进度后点击状态栏 = 下一行（摸鱼翻页）
    this.statusItem.command = "legado-vscode.statusBarNextLine";
    this.statusItem.show();
    vscode.commands.executeCommand(
      "setContext",
      "legado-vscode:statusBarReady",
      true
    );
  }

  // ============ 翻行/翻章（命令入口） ============

  public prevLine() {
    if (!this.displayProgress) return;
    if (this.fetching) return;
    if (this.lineIndex > 0) {
      this.lineIndex--;
      this.updateStatusBar();
      this.syncLineProgressToPanel();
    } else {
      // 本章首行再往上：跳到上一章末行
      this.prevChapter();
    }
  }

  public nextLine() {
    if (!this.displayProgress) return;
    if (this.fetching) return;
    if (this.lineIndex < this.chapterLines.length - 1) {
      this.lineIndex++;
      this.updateStatusBar();
      this.syncLineProgressToPanel();
    } else {
      // 本章末行再往下：跳到下一章首行
      this.nextChapter();
    }
  }

  public async prevChapter() {
    if (!this.displayProgress || this.fetching) return;
    if (!this.catalogLoaded) {
      await this.fetchCatalog();
    }
    const prevIndex = this.displayProgress.chapterIndex - 1;
    if (prevIndex < 0) {
      vscode.window.setStatusBarMessage("$(book) 已是第一章", 1500);
      return;
    }
    this.displayProgress = {
      ...this.displayProgress,
      chapterIndex: prevIndex,
      chapterPos: 0,
      chapterTitle: this.catalog[prevIndex]?.title
    };
    await this.fetchChapterContent("last");
    // 上一章加载完成、lineIndex 已定位到末行，用末行偏移同步给面板，让面板也滚到末行
    this.syncLineProgressToPanel();
  }

  public async nextChapter() {
    if (!this.displayProgress || this.fetching) return;
    if (!this.catalogLoaded) {
      await this.fetchCatalog();
    }
    const nextIndex = this.displayProgress.chapterIndex + 1;
    if (this.catalog.length > 0 && nextIndex >= this.catalog.length) {
      vscode.window.setStatusBarMessage("$(book) 已是最后一章", 1500);
      return;
    }
    this.displayProgress = {
      ...this.displayProgress,
      chapterIndex: nextIndex,
      chapterPos: 0,
      chapterTitle: this.catalog[nextIndex]?.title
    };
    await this.fetchChapterContent("first");
    this.syncProgressToPanel();
  }

  /** 把状态栏翻章后的进度同步回 webview 面板 */
  private syncProgressToPanel() {
    if (!this.displayProgress) return;
    this.expectPanelEcho = true;
    WebAppPanel.syncProgressToPanel({
      chapterIndex: this.displayProgress.chapterIndex,
      chapterPos: this.displayProgress.chapterPos
    });
  }

  /**
   * 状态栏翻行后，把当前行对应的字符偏移同步回面板，让面板滚动跟随
   * chapterPos 累加每行纯文本长度（含换行符），与面板基于渲染内容的偏移可能略有差异但足够定位
   */
  private syncLineProgressToPanel() {
    if (!this.displayProgress) return;
    const pos = this.lineIndexToChapterPos(this.lineIndex);
    this.displayProgress = { ...this.displayProgress, chapterPos: pos };
    this.expectPanelEcho = true;
    WebAppPanel.syncProgressToPanel({
      chapterIndex: this.displayProgress.chapterIndex,
      chapterPos: pos
    });
  }

  /** 当前行索引对应的章节字符偏移 */
  private lineIndexToChapterPos(lineIdx: number): number {
    let pos = 0;
    for (let i = 0; i < lineIdx && i < this.chapterLines.length; i++) {
      // +1 为换行符
      pos += this.chapterLines[i].text.length + 1;
    }
    return pos;
  }

  /** 弹出 InputBox 让用户输入行数并跳转 */
  public async gotoLine() {
    if (!this.displayProgress || this.chapterLines.length === 0) return;
    const total = this.chapterLines.length;
    const current = this.lineIndex + 1;
    const input = await vscode.window.showInputBox({
      title: "跳转到行",
      prompt: `请输入行数（1 - ${total}）`,
      value: String(current),
      validateInput: (val) => {
        const n = Number(val);
        if (!/^\d+$/.test(val.trim())) return "请输入正整数";
        if (n < 1 || n > total) return `行数范围：1 - ${total}`;
        return undefined;
      }
    });
    if (!input) return;
    const target = Number(input.trim()) - 1;
    if (target >= 0 && target < total) {
      this.lineIndex = target;
      this.updateStatusBar();
      this.syncLineProgressToPanel();
    }
  }

  public dispose() {
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
    LegadoStatusBar.current = undefined;
    vscode.commands.executeCommand(
      "setContext",
      "legado-vscode:statusBarReady",
      false
    );
  }
}
