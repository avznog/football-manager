/** Barrel for the UI primitives. Import from "@/components/ui". */

export { Avatar, initialsOf, type AvatarProps, type AvatarSize } from "./avatar";
export { Badge, type BadgeProps, type BadgeVariant } from "./badge";
export {
  Button,
  ButtonLink,
  buttonClassName,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonSize,
  type ButtonVariant,
} from "./button";
export { Card, type CardProps } from "./card";
export { cn } from "./cn";
/** Raw colour maths lives in `@/lib/color`; only the CSS-facing helpers are re-exported here. */
export { inkOnColor, isReadableOnColor, parseHex } from "./contrast";
export { DateInput, type DateInputProps } from "./date-input";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export { Field, type FieldProps } from "./field";
export { FieldError, type FieldErrorProps } from "./field-error";
export { Input, controlClassName, type InputProps } from "./input";
export { Label, type LabelProps } from "./label";
export {
  SegmentedControl,
  type SegmentOption,
  type SegmentTone,
  type SegmentedControlProps,
} from "./segmented-control";
export { Select, type SelectProps } from "./select";
export { Sheet, type SheetProps } from "./sheet";
export { Spinner, type SpinnerProps } from "./spinner";
export { Textarea, type TextareaProps } from "./textarea";
