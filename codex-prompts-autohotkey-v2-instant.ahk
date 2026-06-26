#Requires AutoHotkey v2.0
#SingleInstance Force

; Codex prompt hotstrings for AutoHotkey v2.
; Type a trigger such as ;cxgo in Codex, then the text expands immediately.
; Prompt bodies are managed in docs/codex-prompts.md.
;
; Codex Pro workflow keeps only the high-value shortcuts here.
; Rare templates remain available by typing their template ID manually.

::;ahtest::OK

SendCodexTemplate(templateId, extraText := "") {
  text := "docs/codex-prompts.md の " templateId " を使ってください。"
  if (extraText != "") {
    text .= "`n" extraText
  }
  SendText text
}

; Primary Pro workflow
::;cxgo::SendCodexTemplate("T18", "タスク: {{タスク}}`nゴール: {{ゴール}}`n対象ファイル候補: {{対象ファイル候補}}")
::;cxfast::SendCodexTemplate("T18", "タスク: {{タスク}}`nゴール: {{ゴール}}`n対象ファイル候補: {{対象ファイル候補}}")
::;cx18::SendCodexTemplate("T18", "タスク: {{タスク}}`nゴール: {{ゴール}}`n対象ファイル候補: {{対象ファイル候補}}")

; Deliberate stop/check points
::;cxq::SendCodexTemplate("T01", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}`nまだコード変更しないでください。")
::;cx01::SendCodexTemplate("T01", "目的: {{目的}}`n対象ファイル候補: {{対象ファイル候補}}`nまだコード変更しないでください。")
::;cxpr::SendCodexTemplate("T03", "PR番号: #{{PR番号}}`nまだコード変更しないでください。")
::;cx03::SendCodexTemplate("T03", "PR番号: #{{PR番号}}`nまだコード変更しないでください。")
::;cxgas::SendCodexTemplate("T11")
::;cx11::SendCodexTemplate("T11")
::;cxmkpr::SendCodexTemplate("T17", "まだReady for review化せず、まだマージしないでください。")
::;cx17::SendCodexTemplate("T17", "まだReady for review化せず、まだマージしないでください。")

; Context read, useful at the start of an unfamiliar repo.
::;cx00::SendCodexTemplate("T00")
