"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ChevronDown, Eye, EyeOff, Plug, Wifi } from "lucide-react";
import {
  Box,
  Checkbox,
  Field,
  Icon,
  IconButton,
  InputGroup,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { connectAction, testConnectionAction } from "@/api/actions";
import { INITIAL_CONNECT_STATE } from "@/api/connect_state";
import type { ConnectionDefaultsDto } from "@/api/types";

/**
 * Fields with somewhere on screen to show their own error.
 *
 * Anything the server rejects outside this set is surfaced as a general alert
 * instead, so no rejection can be swallowed.
 */
const RENDERED_FIELDS = new Set(["endpoint", "accessKeyId", "secretAccessKey"]);

/** Connection setup form; submits to the API, no client-side S3 calls. */
export function ConnectForm({
  connection,
}: {
  connection: ConnectionDefaultsDto;
}) {
  const [connectState, connectFormAction, connecting] = useActionState(
    connectAction.bind(null, connection),
    INITIAL_CONNECT_STATE,
  );
  const [testState, testFormAction, testing] = useActionState(
    testConnectionAction.bind(null, connection),
    INITIAL_CONNECT_STATE,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);

  // Controlled rather than left to the DOM, because a form action resets every
  // uncontrolled field once it settles. A rejected attempt would otherwise wipe
  // the credentials the user just typed, which is the moment they least want to
  // retype a forty-character secret.
  const [endpoint, setEndpoint] = useState(connection.endpoint);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [region, setRegion] = useState(connection.region);
  const [forcePathStyle, setForcePathStyle] = useState(
    connection.forcePathStyle,
  );
  const [skipTlsVerification, setSkipTlsVerification] = useState(
    connection.skipTlsVerification,
  );

  const fieldErrors = {
    ...testState.fieldErrors,
    ...connectState.fieldErrors,
  };

  /**
   * Errors for fields this form did not render.
   *
   * Without this they would vanish: a locked deployment shows no target fields,
   * so a rejection naming one of them would leave the form silent and the user
   * with no idea why nothing happened.
   */
  const orphanedErrors = Object.entries(fieldErrors)
    .filter(([field]) => !RENDERED_FIELDS.has(field))
    .map(([, message]) => message);

  const errorMessage =
    connectState.status === "error" && connectState.message
      ? connectState.message
      : testState.status === "error" && testState.message
        ? testState.message
        : orphanedErrors[0];

  return (
    <form action={connectFormAction}>
      <Stack gap="4">
        {connection.locked ? (
          <Field.Root>
            <Field.Label>S3 Endpoint</Field.Label>
            <Box
              px="3"
              py="2"
              width="full"
              borderWidth="1px"
              borderColor="border"
              borderRadius="l2"
              bg="bg.subtle"
              color="fg.muted"
              fontSize="sm"
              fontFamily="mono"
              wordBreak="break-all"
            >
              {connection.endpoint}
            </Box>
            <Field.HelperText>
              This deployment connects to a single, fixed backend.
            </Field.HelperText>
          </Field.Root>
        ) : (
          <Field.Root invalid={Boolean(fieldErrors.endpoint)}>
            <Field.Label>S3 Endpoint</Field.Label>
            <Input
              id="endpoint"
              name="endpoint"
              type="url"
              autoComplete="off"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://s3.example.com"
            />
            <Field.ErrorText>{fieldErrors.endpoint}</Field.ErrorText>
          </Field.Root>
        )}

        <Field.Root invalid={Boolean(fieldErrors.accessKeyId)}>
          <Field.Label>Access Key ID</Field.Label>
          <Input
            id="accessKeyId"
            name="accessKeyId"
            autoComplete="off"
            value={accessKeyId}
            onChange={(event) => setAccessKeyId(event.target.value)}
            placeholder="AKIA…"
          />
          <Field.ErrorText>{fieldErrors.accessKeyId}</Field.ErrorText>
        </Field.Root>

        <Field.Root invalid={Boolean(fieldErrors.secretAccessKey)}>
          <Field.Label>Secret Access Key</Field.Label>
          {/* Masked by default: the field is filled with a credential, often
              with someone else at the desk. Revealing it is a deliberate act,
              usually to check a paste that failed to connect. */}
          <InputGroup
            endElement={
              <IconButton
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setSecretVisible((visible) => !visible)}
                aria-label={
                  secretVisible
                    ? "Hide the secret access key"
                    : "Show the secret access key"
                }
                aria-pressed={secretVisible}
              >
                <Icon size="sm" color="fg.muted" asChild>
                  {secretVisible ? <EyeOff /> : <Eye />}
                </Icon>
              </IconButton>
            }
          >
            <Input
              id="secretAccessKey"
              name="secretAccessKey"
              type={secretVisible ? "text" : "password"}
              autoComplete="off"
              value={secretAccessKey}
              onChange={(event) => setSecretAccessKey(event.target.value)}
              placeholder="••••••••••••"
            />
          </InputGroup>
          <Field.ErrorText>{fieldErrors.secretAccessKey}</Field.ErrorText>
        </Field.Root>

        {connection.locked ? null : (
          <Box borderWidth="1px" borderColor="border" borderRadius="l2">
            <Box
              asChild
              display="flex"
              width="full"
              alignItems="center"
              justifyContent="space-between"
              px="3"
              py="2"
              fontSize="sm"
              color="fg.muted"
              _hover={{ color: "fg" }}
            >
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <span>Advanced settings</span>
                <Icon
                  size="sm"
                  transition="transform 0.2s"
                  transform={advancedOpen ? "rotate(180deg)" : undefined}
                  asChild
                >
                  <ChevronDown />
                </Icon>
              </button>
            </Box>
            {/* Always mounted so form values are submitted even when collapsed;
              otherwise an unopened section would drop forcePathStyle (defaulting
              it to false and breaking path-style addressing). */}
            <Box
              display={advancedOpen ? "block" : "none"}
              borderTopWidth="1px"
              borderColor="border"
              p="3"
            >
              <Stack gap="4">
                <Field.Root>
                  <Field.Label>Region</Field.Label>
                  <Input
                    id="region"
                    name="region"
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  />
                </Field.Root>

                <Checkbox.Root
                  name="forcePathStyle"
                  checked={forcePathStyle}
                  onCheckedChange={(details) =>
                    setForcePathStyle(details.checked === true)
                  }
                  size="sm"
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label fontWeight="normal">
                    Force Path Style (recommended for self-hosted backends)
                  </Checkbox.Label>
                </Checkbox.Root>

                <Checkbox.Root
                  name="skipTlsVerification"
                  checked={skipTlsVerification}
                  onCheckedChange={(details) =>
                    setSkipTlsVerification(details.checked === true)
                  }
                  size="sm"
                  alignItems="flex-start"
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label fontWeight="normal">
                    Skip TLS verification
                    <Text color="fg.muted" fontSize="xs">
                      Insecure. Only for self-signed or internal-CA
                      certificates.
                    </Text>
                  </Checkbox.Label>
                </Checkbox.Root>
              </Stack>
            </Box>
          </Box>
        )}

        {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
        {testState.status === "success" && testState.message ? (
          <Alert variant="info">{testState.message}</Alert>
        ) : null}

        <Stack direction="row" gap="2">
          <Button type="submit" disabled={connecting || testing}>
            {connecting ? (
              <Spinner size="sm" />
            ) : (
              <Icon size="sm" asChild>
                <Plug />
              </Icon>
            )}
            Connect
          </Button>
          <Button
            type="submit"
            variant="outline"
            formAction={testFormAction}
            disabled={connecting || testing}
          >
            {testing ? (
              <Spinner size="sm" />
            ) : (
              <Icon size="sm" asChild>
                <Wifi />
              </Icon>
            )}
            Test Connection
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
