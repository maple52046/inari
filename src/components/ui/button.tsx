import { Button as ChakraButton, IconButton } from "@chakra-ui/react";
import type { ButtonProps as ChakraButtonProps } from "@chakra-ui/react";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive" | "subtle";
type ButtonSize = "sm" | "md" | "icon";

export interface ButtonProps extends Omit<
  ChakraButtonProps,
  "variant" | "size" | "colorPalette"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * The app's button vocabulary expressed as Chakra variant plus palette pairs.
 *
 * Keeping the app-level names means `destructive` stays a single decision here
 * rather than every call site having to remember to pair `solid` with the red
 * palette.
 */
const VARIANTS: Record<
  ButtonVariant,
  Pick<ChakraButtonProps, "variant" | "colorPalette">
> = {
  default: { variant: "solid" },
  outline: { variant: "outline" },
  ghost: { variant: "ghost" },
  destructive: { variant: "solid", colorPalette: "red" },
  subtle: { variant: "subtle" },
};

/** App button with semantic variants tied to the theme's palettes. */
export function Button({
  variant = "default",
  size = "md",
  type,
  ...props
}: ButtonProps) {
  const mapped = VARIANTS[variant];
  const buttonType = type ?? "button";
  if (size === "icon") {
    return <IconButton type={buttonType} size="sm" {...mapped} {...props} />;
  }
  return <ChakraButton type={buttonType} size={size} {...mapped} {...props} />;
}
