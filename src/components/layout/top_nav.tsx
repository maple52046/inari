"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Settings, Sparkles } from "lucide-react";
import { Box, Flex, HStack, Icon } from "@chakra-ui/react";
import { BrandLockup } from "@/components/brand/brand_lockup";
import { Button } from "@/components/ui/button";
import { ColorModeToggle } from "@/components/theme/color_mode";

const NAV_ITEMS = [
  { href: "/buckets", label: "Buckets", icon: Database },
  { href: "/cleanup", label: "Cleanup", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Global top navigation shown on connected pages. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="30"
      borderBottomWidth="1px"
      borderColor="border"
      bg="bg/80"
      backdropFilter="blur(8px)"
    >
      <Flex mx="auto" maxW="7xl" h="14" align="center" gap="2" px="4">
        <Link href="/buckets">
          <BrandLockup withTagline />
        </Link>
        <HStack as="nav" ml="4" gap="1">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "subtle" : "ghost"}
                size="sm"
              >
                <Link href={item.href}>
                  <Icon size="sm" asChild>
                    <item.icon />
                  </Icon>
                  <Box as="span" display={{ base: "none", sm: "inline" }}>
                    {item.label}
                  </Box>
                </Link>
              </Button>
            );
          })}
        </HStack>
        <Box ml="auto">
          <ColorModeToggle />
        </Box>
      </Flex>
    </Box>
  );
}
