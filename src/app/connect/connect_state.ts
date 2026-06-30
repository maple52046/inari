/** Result surfaced to the connection form by the connect/test actions. */
export interface ConnectState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Initial form state before any submission. */
export const INITIAL_CONNECT_STATE: ConnectState = { status: "idle" };
