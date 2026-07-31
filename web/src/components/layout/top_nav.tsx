"use client";

import { Link, useLocation } from "react-router";
import { Database, Settings, Sparkles } from "lucide-react";
import { Box, Flex, HStack, Icon } from "@chakra-ui/react";
import { BrandLockup } from "@/components/brand/brand_lockup";
import { Button } from "@/components/ui/button";
import { GithubMark } from "@/components/ui/github_mark";
import { ColorModeToggle } from "@/components/theme/color_mode";
import { SOURCE_URL } from "@/lib/product";

const NAV_ITEMS = [
  { href: "/buckets", label: "Buckets", icon: Database },
  { href: "/cleanup", label: "Cleanup", icon: Sparkles },
] as const;

const SETTINGS_HREF = "/settings";

/** Whether `href` is the current section, so nested routes stay highlighted. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Global top navigation shown on connected pages. */
export function TopNav() {
  const pathname = useLocation().pathname;
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
        <Link to="/buckets">
          <BrandLockup />
        </Link>
        <HStack as="nav" ml="4" gap="1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "subtle" : "ghost"}
                size="sm"
              >
                <Link to={item.href}>
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
        <HStack ml="auto" gap="1">
          <Button asChild variant="ghost" size="sm">
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              <Icon size="sm" asChild>
                <GithubMark />
              </Icon>
              <Box as="span" display={{ base: "none", sm: "inline" }}>
                Github
              </Box>
            </a>
          </Button>
          <ColorModeToggle />
          <Button
            asChild
            variant={isActive(pathname, SETTINGS_HREF) ? "subtle" : "ghost"}
            size="icon"
            aria-label="Settings"
            title="Settings"
          >
            <Link to={SETTINGS_HREF}>
              <Icon size="sm" asChild>
                <Settings />
              </Icon>
            </Link>
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}
