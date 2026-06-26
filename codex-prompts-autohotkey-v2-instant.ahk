#Requires AutoHotkey v2.0
#SingleInstance Force

; Codex prompt hotstrings for AutoHotkey v2.
; Type a trigger such as ;cx18 in Codex, then the text expands immediately.
; Prompt bodies are managed in docs/codex-prompts.md.

::;ahtest::OK

SendCodexTemplate(templateId, extraText := "") {
  text := "docs/codex-prompts.md の " templateId " を使ってください。"
  if (extraText != "") {
    text .= "`n" extraText
  }
  SendText text
}

; Basic templates
::;cx00::SendCodexTemplate("T00")
::;cx01::SendCodexTemplate("T01", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}`nまだコード変更しないでください。")
::;cx02::SendCodexTemplate("T02", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}`n期待する挙動: {{期待する挙動}}")
::;cx03::SendCodexTemplate("T03", "PR番号: #{{PR番号}}`nまだコード変更しないでください。")
::;cx04::SendCodexTemplate("T04", "PR番号: #{{PR番号}}`nまだコード変更しないでください。")
::;cx05::SendCodexTemplate("T05", "対象PR: {{対象PR}}`nまだコード変更しないでください。")
::;cx06::SendCodexTemplate("T06", "固定したい仕様: {{仕様}}`n対象ファイル候補: {{対象ファイル候補}}")
::;cx07::SendCodexTemplate("T07", "不具合: {{不具合}}`n再現条件: {{再現条件}}`n期待結果: {{期待結果}}`n実際の結果: {{実際の結果}}")
::;cx08::SendCodexTemplate("T08", "目的: {{目的}}`n期待するUI: {{期待するUI}}")
::;cx09::SendCodexTemplate("T09", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}")
::;cx10::SendCodexTemplate("T10", "対象フォーマット: {{楽天フォーマット名}}`n入力ヘッダー例: {{ヘッダー例}}`nマッピング方針: {{マッピング方針}}")
::;cx11::SendCodexTemplate("T11")
::;cx12::SendCodexTemplate("T12", "変更内容: {{変更内容}}")
::;cx13::SendCodexTemplate("T13", "対象: {{関数名またはファイル名}}")
::;cx14::SendCodexTemplate("T14")
::;cx15::SendCodexTemplate("T15")
::;cx16::SendCodexTemplate("T16", "PR番号: #{{PR番号}}")
::;cx17::SendCodexTemplate("T17", "まだReady for review化せず、まだマージしないでください。")
::;cx18::SendCodexTemplate("T18", "タスク: {{タスク}}`nゴール: {{ゴール}}`n対象ファイル候補: {{対象ファイル候補}}")

; Aliases
::;cxq::SendCodexTemplate("T01", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}`nまだコード変更しないでください。")
::;cxi::SendCodexTemplate("T02", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}`n期待する挙動: {{期待する挙動}}")
::;cxpr::SendCodexTemplate("T03", "PR番号: #{{PR番号}}`nまだコード変更しないでください。")
::;cxbug::SendCodexTemplate("T07", "不具合: {{不具合}}`n再現条件: {{再現条件}}`n期待結果: {{期待結果}}`n実際の結果: {{実際の結果}}")
::;cxui::SendCodexTemplate("T08", "目的: {{目的}}`n期待するUI: {{期待するUI}}")
::;cxdb::SendCodexTemplate("T09", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}")
::;cxgas::SendCodexTemplate("T11")
::;cxdoc::SendCodexTemplate("T12", "変更内容: {{変更内容}}")
::;cxmkpr::SendCodexTemplate("T17", "まだReady for review化せず、まだマージしないでください。")
::;cxgo::SendCodexTemplate("T18", "タスク: {{タスク}}`nゴール: {{ゴール}}`n対象ファイル候補: {{対象ファイル候補}}")
::;cxfast::SendCodexTemplate("T18", "タスク: {{タスク}}`nゴール: {{ゴール}}`n対象ファイル候補: {{対象ファイル候補}}")
