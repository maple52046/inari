"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  DatePicker,
  Icon,
  IconButton,
  Portal,
  parseDate,
} from "@chakra-ui/react";
import type { DateValue } from "@chakra-ui/react";

/**
 * A single date, themed by the app rather than by the browser.
 *
 * Replaces `<input type="date">`, whose field can be styled but whose calendar
 * cannot: that popup is the browser's own, so it looks different in every one
 * and ignores the colour mode entirely, which on a dark dashboard is the one
 * surface that stands out as not belonging.
 *
 * The value stays an ISO `YYYY-MM-DD` string, the same shape the native input
 * produced, so every caller and the filter behind them are unaffected.
 */
export function DateField({
  value,
  onChange,
  label,
  id,
}: {
  /** ISO `YYYY-MM-DD`, or empty for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Names the field for assistive technology; never rendered. */
  label: string;
  /**
   * Ties a visible `<label htmlFor>` to the text input.
   *
   * Declared through the machine's `ids` rather than set on the input, which
   * the machine finds by that id to manage focus and to write the value back.
   * Overwriting the attribute alone leaves those lookups empty.
   */
  id?: string;
}) {
  return (
    <DatePicker.Root
      {...(id ? { ids: { input: () => id } } : {})}
      value={toDateValues(value)}
      // Read from the calendar value rather than `valueAsString`, which is
      // formatted for the reader's locale. The stored contract is ISO, which
      // `parseDateInput` reads as UTC midnight so the filter does not shift
      // with the host timezone; a locale string would both fail to parse back
      // into the picker and quietly move the boundary by the UTC offset.
      onValueChange={(details) => onChange(details.value[0]?.toString() ?? "")}
      positioning={{ sameWidth: false }}
    >
      <DatePicker.Control>
        <DatePicker.Input width="9rem" aria-label={label} />
        {/* Hides itself while there is nothing to clear, so no condition of
            our own is needed here. */}
        <DatePicker.ClearTrigger asChild>
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={`Clear ${label}`}
            title="Clear"
          >
            <Icon size="sm" asChild>
              <X />
            </Icon>
          </IconButton>
        </DatePicker.ClearTrigger>
        <DatePicker.Trigger asChild>
          <IconButton
            variant="outline"
            size="sm"
            aria-label={`Open the calendar for ${label}`}
          >
            <Icon size="sm" asChild>
              <CalendarDays />
            </Icon>
          </IconButton>
        </DatePicker.Trigger>
      </DatePicker.Control>

      {/* Portalled so the calendar escapes the toolbar's overflow and stacking
          context; inside it, the popup would be clipped by the panel. */}
      <Portal>
        <DatePicker.Positioner>
          <DatePicker.Content>
            <DatePicker.View view="day">
              <DatePicker.Context>
                {(api) => (
                  <>
                    <DatePicker.ViewControl>
                      <DatePicker.PrevTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label="Previous month"
                        >
                          <Icon size="sm" asChild>
                            <ChevronLeft />
                          </Icon>
                        </IconButton>
                      </DatePicker.PrevTrigger>
                      {/* Two selects rather than the click-through month and
                          year views: reaching a date years back otherwise costs
                          a drill down and back up again. */}
                      <DatePicker.MonthSelect />
                      <DatePicker.YearSelect />
                      <DatePicker.NextTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label="Next month"
                        >
                          <Icon size="sm" asChild>
                            <ChevronRight />
                          </Icon>
                        </IconButton>
                      </DatePicker.NextTrigger>
                    </DatePicker.ViewControl>

                    <DatePicker.Table>
                      <DatePicker.TableHead>
                        <DatePicker.TableRow>
                          {api.weekDays.map((day) => (
                            <DatePicker.TableHeader key={day.short}>
                              {day.narrow}
                            </DatePicker.TableHeader>
                          ))}
                        </DatePicker.TableRow>
                      </DatePicker.TableHead>
                      <DatePicker.TableBody>
                        {api.weeks.map((week) => (
                          <DatePicker.TableRow key={week[0]?.toString()}>
                            {week.map((day) => (
                              <DatePicker.TableCell
                                key={day.toString()}
                                value={day}
                              >
                                <DatePicker.TableCellTrigger asChild>
                                  <IconButton variant="ghost" size="sm">
                                    {day.day}
                                  </IconButton>
                                </DatePicker.TableCellTrigger>
                              </DatePicker.TableCell>
                            ))}
                          </DatePicker.TableRow>
                        ))}
                      </DatePicker.TableBody>
                    </DatePicker.Table>
                  </>
                )}
              </DatePicker.Context>
            </DatePicker.View>
          </DatePicker.Content>
        </DatePicker.Positioner>
      </Portal>
    </DatePicker.Root>
  );
}

/**
 * Parses the stored string into what the picker expects.
 *
 * A half-typed date is not an error: the field is editable, so the value passes
 * through unparsable states on the way to a complete one. Those simply select
 * nothing rather than throwing.
 */
function toDateValues(value: string): DateValue[] {
  if (!value) {
    return [];
  }
  try {
    return [parseDate(value)];
  } catch {
    return [];
  }
}
