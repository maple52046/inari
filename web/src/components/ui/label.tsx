import { chakra } from "@chakra-ui/react";

/** Form label styled by the theme. */
export const Label = chakra("label", {
  base: {
    display: "block",
    mb: "1.5",
    fontSize: "sm",
    fontWeight: "medium",
    color: "fg",
  },
});
