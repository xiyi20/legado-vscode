// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { WebAppPanel } from "./WebAppPanel";
import { LegadoStatusBar } from "./LegadoStatusBar";

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log("Congratulations, your extension \"legado-vscode\" is now active!");

  // 创建状态栏摸鱼阅读器
  const statusBar = new LegadoStatusBar();
  LegadoStatusBar.current = statusBar;
  context.subscriptions.push(statusBar);

  let openVueApp = vscode.commands.registerCommand("legado-vscode.openLegado", () => {
    WebAppPanel.createOrShow(context.extensionUri);
  });

  let closeVueApp = vscode.commands.registerCommand("legado-vscode.closeLegado", () => {
    WebAppPanel.kill();
  });

  // 状态栏摸鱼翻行（首行继续上翻自动接上一章末行，末行继续下翻自动接下一章首行）
  const prevLine = vscode.commands.registerCommand(
    "legado-vscode.statusBarPrevLine",
    () => LegadoStatusBar.current?.prevLine()
  );
  const nextLine = vscode.commands.registerCommand(
    "legado-vscode.statusBarNextLine",
    () => LegadoStatusBar.current?.nextLine()
  );
  // 点击 tooltip 进度按钮弹出 InputBox 输入行数跳转
  const gotoLine = vscode.commands.registerCommand(
    "legado-vscode.statusBarGotoLine",
    () => LegadoStatusBar.current?.gotoLine()
  );

  context.subscriptions.push(
    openVueApp,
    closeVueApp,
    prevLine,
    nextLine,
    gotoLine
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  WebAppPanel.kill();
}
