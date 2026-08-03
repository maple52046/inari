"use client";

import { useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Icon, Portal, Select, createListCollection } from "@chakra-ui/react";

/** One choice, as the field renders and reports it. */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  /** Currently selected value; empty selects nothing. */
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Names the field for assistive technology when no visible label does. */
  label?: string;
  /**
   * Ties a visible `<label htmlFor>` to the trigger.
   *
   * Declared through the machine's `ids` rather than set on the trigger
   * directly. The machine finds the trigger by that id to use as the popup's
   * positioning reference, so overwriting the attribute alone leaves the lookup
   * empty and the list pinned to its ancestor's top-left corner.
   */
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: string;
  size?: "sm" | "md";
  /**
   * Whether the list escapes to the document body.
   *
   * On by default because an ancestor that clips, such as a collapsible's
   * animating content, would otherwise cut the list off. It has to be off
   * inside a dialog: the list would land outside the dialog's DOM, where its
   * own dismiss handling reads a click on an option as a click outside and
   * closes the dialog under the user.
   */
  portalled?: boolean;
}

/**
 * A single-choice select themed by the app rather than by the browser.
 *
 * Replaces `NativeSelect`, which is Chakra but deliberately renders a real
 * `<select>`: its field can be styled while the list that drops out of it is
 * drawn by the browser, so it looks different in every one and ignores the
 * colour mode. That is the same split `<input type="date">` had.
 */
export function SelectField({
  value,
  onChange,
  options,
  label,
  id,
  placeholder,
  disabled,
  width = "auto",
  size = "md",
  portalled = true,
}: SelectFieldProps) {
  // Rebuilt only when the options change: the collection is identity-compared,
  // so a fresh one on every render resets the list's own highlight state.
  const collection = useMemo(
    () => createListCollection({ items: options }),
    [options],
  );

  // An empty string is a selection whenever an option carries it, which is how
  // a field spells "no restriction". Treating empty as "nothing selected" would
  // leave such a field blank on arrival, reading as unset while it is in fact
  // acting. Anything with no matching option genuinely has no selection, and
  // falls through to the placeholder.
  const selected = options.some((option) => option.value === value)
    ? [value]
    : [];

  const list = (
    <Select.Positioner>
      <Select.Content>
        {options.map((option) => (
          <Select.Item key={option.value} item={option}>
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator>
              <Icon size="sm" asChild>
                <Check />
              </Icon>
            </Select.ItemIndicator>
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Positioner>
  );

  return (
    <Select.Root
      collection={collection}
      value={selected}
      onValueChange={(details) => onChange(details.value[0] ?? "")}
      disabled={disabled}
      width={width}
      size={size}
      positioning={{ sameWidth: false }}
      {...(id ? { ids: { trigger: id } } : {})}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger aria-label={label}>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator>
            <Icon size="sm" color="fg.muted" asChild>
              <ChevronsUpDown />
            </Icon>
          </Select.Indicator>
        </Select.IndicatorGroup>
      </Select.Control>
      {portalled ? <Portal>{list}</Portal> : list}
    </Select.Root>
  );
}

/** Builds options from plain strings, whose label and value are the same. */
export function toSelectOptions(values: readonly string[]): SelectOption[] {
  return values.map((value) => ({ value, label: value }));
}
