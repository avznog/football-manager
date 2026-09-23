/**
 * Public surface of the composition screens.
 *
 * `CompositionEditor` and `SquadSheet` are Client Components (pointer events, `useActionState`);
 * `LineupPitch` and `PlanChanges` ship no JavaScript, so a Server Component can render a
 * composition without paying for the editor.
 */

export {
  CompositionEditor,
  type CompositionEditorProps,
  type EditorFormation,
  type EditorMember,
} from "./composition-editor";
export { LineupPitch, type LineupPitchMember, type LineupPitchProps } from "./lineup-pitch";
export { PlanChanges, ChangeLines, type PlanChangesProps, type ChangeLinesProps } from "./plan-changes";
export { SquadSheet, type SheetMember, type SquadSheetProps } from "./squad-sheet";
